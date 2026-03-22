// -*- mode: Bluespec; -*-

/// Savage Worlds Adventure Edition - Character Status State Machine
/// Models the status/condition system for formal verification of game rule invariants.
/// All dice rolls and stats are pre-resolved: the caller provides results as arguments.

module savage {

  // ============================================================
  // 1. TYPES
  // ============================================================

  /// Complete character status state
  type State = {
    // Conditions
    shaken: bool,
    stunned: bool,
    distracted: int,        // -1 = inactive, >= 0 = turns until expiry (at endOfTurn)
    vulnerable: int,        // -1 = inactive, >= 0 = turns until expiry

    // Damage track
    wounds: int,            // 0 to maxWounds
    incapacitated: bool,
    bleedingOut: bool,
    dead: bool,

    // Fatigue track
    fatigue: int,           // 0 = none, 1 = Fatigued, 2 = Exhausted
    incapByFatigue: bool,

    // Character context (immutable after init)
    isWildCard: bool,
    maxWounds: int,         // 3 for Wild Cards, 1 for Extras

    // Turn phase
    ownTurn: bool,

    // Position
    prone: bool,

    // Hold
    onHold: bool,

    // Restraint / Grapple
    restrained: int,        // -1 = free, 0 = entangled, 1 = bound, 2 = grabbed, 3 = pinned
    grappledBy: str,        // opponent identifier ("" = not grappled)

    // Vision
    blinded: int,           // 0 = clear, 2 = impaired, 4 = blinded

    // Injuries (permanent, from Injury Table on incapacitation)
    injuries: List[str],    // list of injury type identifiers

    // Afflictions (poison/disease)
    afflictionType: str,    // "none", "paralytic", "weak", "lethal", "sleep"
    afflictionTimer: int,   // -1 = none, >= 0 = turns remaining

    // Active power effects (buffs/debuffs with duration)
    activeEffects: List[{etype: str, timer: int}]
  }

  // ============================================================
  // 2. CONSTANTS
  // ============================================================

  pure val FRESH_WILD_CARD: State = {
    shaken: false, stunned: false, distracted: -1, vulnerable: -1,
    wounds: 0, incapacitated: false, bleedingOut: false, dead: false,
    fatigue: 0, incapByFatigue: false,
    isWildCard: true, maxWounds: 3, ownTurn: false,
    prone: false, onHold: false, restrained: -1, grappledBy: "",
    blinded: 0, injuries: List(),
    afflictionType: "none", afflictionTimer: -1,
    activeEffects: List()
  }

  pure val FRESH_EXTRA: State = {
    shaken: false, stunned: false, distracted: -1, vulnerable: -1,
    wounds: 0, incapacitated: false, bleedingOut: false, dead: false,
    fatigue: 0, incapByFatigue: false,
    isWildCard: false, maxWounds: 1, ownTurn: false,
    prone: false, onHold: false, restrained: -1, grappledBy: "",
    blinded: 0, injuries: List(),
    afflictionType: "none", afflictionTimer: -1,
    activeEffects: List()
  }

  // Bounded ranges for nondeterministic exploration
  pure val MARGINS = 0.to(15)       // damage - toughness (negatives are no-ops)
  pure val SOAK_RANGE = 0.to(4)     // 0 = no soak or failed, 1+ = wounds soaked
  pure val ROLL_RANGE = (-1).to(3)  // -1 = critfail, 0 = fail, 1 = success, 2+ = raises
  pure val HEAL_RANGE = 1.to(3)

  // Injury Table roll range: tableRoll * 10 + subRoll (e.g., 52 = table 5, sub 2)
  pure val INJURY_ROLL_RANGE = Set(20, 30, 40, 51, 52, 53, 54, 55, 56, 100, 110, 121, 122, 123, 124, 125, 126)

  // ============================================================
  // 3. PURE FUNCTIONS
  // ============================================================

  // --- Helpers ---
  pure def max(a: int, b: int): int = if (a > b) a else b

  /// Resolve Injury Table roll to injury type string.
  /// injuryRoll encodes 2d6 table roll and d6 sub-roll: tableRoll * 10 + subRoll.
  /// Table: 2 = unmentionables, 3-4 = arm, 5-9 = guts (sub: 1-2 broken, 3-4 battered, 5-6 busted),
  /// 10-11 = leg, 12 = head (sub: 1-3 scar, 4-5 blinded, 6 brain_damage)
  pure def pResolveInjury(injuryRoll: int): str = {
    val tableRoll = injuryRoll / 10
    val subRoll = injuryRoll % 10
    if (tableRoll <= 2) "unmentionables"
    else if (tableRoll <= 4) "arm"
    else if (tableRoll <= 9) {
      if (subRoll <= 2) "guts_broken"
      else if (subRoll <= 4) "guts_battered"
      else "guts_busted"
    }
    else if (tableRoll <= 11) "leg"
    else {
      if (subRoll <= 3) "head_scar"
      else if (subRoll <= 5) "head_blinded"
      else "head_brain_damage"
    }
  }

  /// Clear all conditions when dying — dead is absorbing, no residual state
  pure def die(s: State): State = {
    ...s, dead: true, shaken: false, stunned: false,
    distracted: -1, vulnerable: -1,
    incapacitated: false, bleedingOut: false,
    fatigue: 0, incapByFatigue: false,
    prone: false, onHold: false, restrained: -1, grappledBy: "",
    blinded: 0, injuries: List(),
    afflictionType: "none", afflictionTimer: -1,
    activeEffects: List()
  }

  // --- Derived state ---

  /// Distracted: from timer OR from Stunned (Stunned sets its own Distracted timer)
  pure def isDistracted(s: State): bool = s.distracted >= 0

  /// Vulnerable: from timer OR implied by Stunned
  pure def isVulnerable(s: State): bool = s.stunned or s.vulnerable >= 0

  /// Not dead, not incapacitated by wounds or fatigue
  pure def isActive(s: State): bool =
    not(s.dead) and not(s.incapacitated) and not(s.incapByFatigue)

  /// Can take standard actions (not Shaken, not Stunned, and active)
  pure def canAct(s: State): bool =
    s.isActive() and not(s.shaken) and not(s.stunned)

  /// Can move (Shaken allows movement, Stunned does not)
  pure def canMove(s: State): bool =
    s.isActive() and not(s.stunned)

  /// Total penalty to all trait rolls from wounds + fatigue
  pure def totalPenalty(s: State): int = {
    val wp = if (s.wounds > 3) 3 else s.wounds
    -(wp + s.fatigue)
  }

  // --- Core transitions ---
  // All pure functions take State + args, return {success, newState}.
  // Actions are thin wrappers that call these.

  /// Take damage.
  /// margin: damage - toughness (must be >= 0 for any effect).
  /// soakSuccesses: 0 = no soak or failed vigor roll, 1+ = wounds negated by soak.
  /// incapRoll: -1 = critfail, 0 = fail, 1+ = success/raise.
  ///            Only used when a Wild Card becomes incapacitated from this hit.
  /// injuryRoll: tableRoll * 10 + subRoll, used only on incap success/raise.
  pure def pTakeDamage(
    s: State,
    margin: int,
    soakSuccesses: int,
    incapRoll: int,
    injuryRoll: int
  ): {success: bool, newState: State} = {
    if (s.dead or s.incapacitated or s.incapByFatigue or margin < 0) {
      {success: false, newState: s}
    } else {
      val raises = margin / 4
      // Shaken-on-Shaken: if already Shaken, at least 1 wound
      val rawWounds = if (s.shaken) max(raises, 1) else raises
      // Soak only applies when there are wounds
      val effectiveSoak = if (rawWounds > 0) soakSuccesses else 0
      val actualWounds = max(0, rawWounds - effectiveSoak)
      // If soak removed ALL wounds, also clears Shaken (even pre-existing)
      val allSoaked = actualWounds == 0 and effectiveSoak > 0
      val newShaken = not(allSoaked)
      val newWounds = s.wounds + actualWounds

      if (not(s.isWildCard) and actualWounds > 0) {
        // Extra: any wound = eliminated
        {success: true, newState: die({...s, wounds: s.maxWounds})}
      } else if (s.isWildCard and newWounds > s.maxWounds) {
        // Wild Card: exceeds max wounds = incapacitated + immediate vigor roll
        val base = {...s, wounds: s.maxWounds, shaken: false, stunned: false, incapacitated: true, prone: false, onHold: false, restrained: -1, grappledBy: "", blinded: 0}
        if (incapRoll < 0) {
          {success: true, newState: die(base)}
        } else if (incapRoll == 0) {
          // Fail: bleeding out, no injury roll
          {success: true, newState: {...base, bleedingOut: true}}
        } else {
          // Success/raise: incapacitated with injury from table
          val injury = pResolveInjury(injuryRoll)
          {success: true, newState: {...base, injuries: s.injuries.append(injury)}}
        }
      } else {
        // Becoming shaken clears hold
        val loseHold = newShaken and s.onHold
        {success: true, newState: {...s, wounds: newWounds, shaken: newShaken, onHold: if (loseHold) false else s.onHold}}
      }
    }
  }

  /// Start of turn: transition to own turn + recovery attempts.
  /// Stunned (Vigor) and Shaken (Spirit) recoveries are independent free actions.
  /// vigorRoll: used for bleeding out or stunned recovery. 0 = fail, 1 = success, 2+ = raise.
  /// spiritRoll: used for shaken recovery. 0 = fail, 1 = success, 2+ = raise.
  pure def pStartOfTurn(
    s: State,
    vigorRoll: int,
    spiritRoll: int
  ): {success: bool, newState: State} = {
    if (s.dead or s.ownTurn or s.onHold) {
      {success: false, newState: s}
    } else if (s.incapacitated and s.bleedingOut) {
      // Bleeding out: Vigor check each turn
      if (vigorRoll == 0) {
        {success: true, newState: die({...s, ownTurn: true})}
      } else if (vigorRoll >= 2) {
        // Raise: stabilized
        {success: true, newState: {...s, ownTurn: true, bleedingOut: false}}
      } else {
        // Success: still bleeding, survived this turn
        {success: true, newState: {...s, ownTurn: true}}
      }
    } else if (s.incapacitated or s.incapByFatigue or s.afflictionType == "sleep") {
      // Incapacitated/sleeping — no per-turn recovery
      {success: true, newState: {...s, ownTurn: true}}
    } else {
      // Active: attempt Stunned and Shaken recovery independently
      val s1 = {...s, ownTurn: true}

      // Stunned recovery (Vigor check) — blocked by paralytic affliction
      val s2 = if (s1.stunned and s1.afflictionType != "paralytic") {
        if (vigorRoll >= 2) {
          // Raise: clear Stunned, Vulnerable until end of current turn
          {...s1, stunned: false, vulnerable: max(s1.vulnerable, 0)}
        } else if (vigorRoll >= 1) {
          // Success: clear Stunned, Vulnerable until end of next turn
          {...s1, stunned: false, vulnerable: max(s1.vulnerable, 1)}
        } else {
          s1
        }
      } else {
        s1
      }

      // Shaken recovery (Spirit check) — independent of Stunned
      val s3 = if (s2.shaken) {
        if (spiritRoll >= 1) {
          {...s2, shaken: false}
        } else {
          s2
        }
      } else {
        s2
      }

      // Blinded recovery (reuses vigorRoll): raise → clear, success → step down by 2
      val s4 = if (s3.blinded > 0) {
        if (vigorRoll >= 2) {
          {...s3, blinded: 0}
        } else if (vigorRoll >= 1) {
          {...s3, blinded: max(0, s3.blinded - 2)}
        } else {
          s3
        }
      } else {
        s3
      }

      // Affliction per-turn effects
      val s5 = if (s4.afflictionType == "weak") {
        // Weak: +1 fatigue
        val r = pApplyFatigue(s4)
        r.newState
      } else if (s4.afflictionType == "lethal") {
        // Lethal: +1 fatigue + shaken + 1 wound (can cascade to incap/death)
        val sf = pApplyFatigue(s4)
        val sw = {...sf.newState, shaken: true, wounds: sf.newState.wounds + 1}
        if (sw.wounds > sw.maxWounds) {
          // Exceeds max — incapacitate (no incapRoll for affliction damage)
          {...sw, wounds: sw.maxWounds, incapacitated: true, bleedingOut: true,
           stunned: false, prone: false, onHold: false, restrained: -1, grappledBy: "", blinded: 0}
        } else {
          sw
        }
      } else {
        s4
      }

      {success: true, newState: s5}
    }
  }

  /// End of turn: expire timed conditions, transition to others' turns.
  /// Also handles round-end for held characters (hold expires).
  pure def pEndOfTurn(s: State): {success: bool, newState: State} = {
    if (s.onHold) {
      // Round ends, hold expires
      {success: true, newState: {...s, onHold: false}}
    } else if (not(s.ownTurn)) {
      {success: false, newState: s}
    } else {
      // Bound/grabbed/pinned characters keep distracted + vulnerable (conditions don't expire)
      val nd = if (s.restrained >= 1 and s.distracted >= 0) s.distracted
               else if (s.distracted > 0) s.distracted - 1
               else if (s.distracted == 0) -1
               else -1
      val nv = if (s.restrained >= 1 and s.vulnerable >= 0) s.vulnerable
               else if (s.vulnerable > 0) s.vulnerable - 1
               else if (s.vulnerable == 0) -1
               else -1
      // Tick affliction timer
      val newAffTimer = if (s.afflictionTimer > 0) s.afflictionTimer - 1
                        else if (s.afflictionTimer == 0) -1
                        else -1
      val newAffType = if (newAffTimer == -1 and s.afflictionTimer >= 0) "none" else s.afflictionType
      // Tick power effect timers and remove expired
      val tickedEffects = s.activeEffects.foldl(List(), (acc, e) =>
        if (e.timer - 1 > 0) acc.append({etype: e.etype, timer: e.timer - 1})
        else acc
      )
      {success: true, newState: {...s, ownTurn: false, distracted: nd, vulnerable: nv,
        afflictionTimer: newAffTimer, afflictionType: newAffType,
        activeEffects: tickedEffects}}
    }
  }

  /// Spend benny to clear Shaken (can happen at any time, even others' turns).
  pure def pUnshake(s: State): {success: bool, newState: State} = {
    if (s.shaken and not(s.dead) and not(s.incapacitated)) {
      {success: true, newState: {...s, shaken: false}}
    } else {
      {success: false, newState: s}
    }
  }

  /// Apply Stunned from external source (stun power, electroshock, creature ability).
  /// Also sets Distracted timer (Stunned implies both Distracted and Vulnerable).
  pure def pApplyStunned(s: State): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      // Timer: 1 if during own turn (survives current + next endOfTurn), 0 if others' turn
      val timer = if (s.ownTurn) 1 else 0
      {success: true, newState: {...s, stunned: true, distracted: max(s.distracted, timer), onHold: false}}
    }
  }

  /// Apply Distracted from external source (trick, power, special ability).
  pure def pApplyDistracted(s: State): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      val timer = if (s.ownTurn) 1 else 0
      {success: true, newState: {...s, distracted: max(s.distracted, timer)}}
    }
  }

  /// Apply Vulnerable from external source (trick, power, special ability).
  pure def pApplyVulnerable(s: State): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      val timer = if (s.ownTurn) 1 else 0
      {success: true, newState: {...s, vulnerable: max(s.vulnerable, timer)}}
    }
  }

  /// Apply one level of fatigue (from hazards, powers, stress, etc.).
  pure def pApplyFatigue(s: State): {success: bool, newState: State} = {
    if (s.dead or s.incapByFatigue) {
      {success: false, newState: s}
    } else if (s.fatigue >= 2) {
      // Already Exhausted, one more = incapacitated by fatigue
      {success: true, newState: {...s, incapByFatigue: true, prone: false, onHold: false, restrained: -1, grappledBy: "", blinded: 0}}
    } else {
      {success: true, newState: {...s, fatigue: s.fatigue + 1}}
    }
  }

  /// Recover one level of fatigue (rest, remove cause, healing skill).
  pure def pRecoverFatigue(s: State): {success: bool, newState: State} = {
    if (s.dead) {
      {success: false, newState: s}
    } else if (s.incapByFatigue) {
      // Recover from fatigue-incap to Exhausted (fatigue stays at 2)
      {success: true, newState: {...s, incapByFatigue: false}}
    } else if (s.fatigue > 0) {
      {success: true, newState: {...s, fatigue: s.fatigue - 1}}
    } else {
      {success: false, newState: s}
    }
  }

  /// Heal wounds (Healing skill, natural healing, or healing power).
  /// Healing at least 1 wound while incapacitated removes incapacitation.
  pure def pHeal(s: State, amount: int): {success: bool, newState: State} = {
    if (s.dead or s.wounds == 0) {
      {success: false, newState: s}
    } else {
      val nw = max(0, s.wounds - amount)
      {success: true, newState: {...s, wounds: nw, incapacitated: false, bleedingOut: false}}
    }
  }

  /// Finishing move: automatically dispatch a helpless (incapacitated) victim.
  pure def pFinishingMove(s: State): {success: bool, newState: State} = {
    if (s.incapacitated) {
      {success: true, newState: die(s)}
    } else {
      {success: false, newState: s}
    }
  }

  /// Drop prone voluntarily. Guard: must be active.
  pure def pDropProne(s: State): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, prone: true}}
    }
  }

  /// Stand up from prone. Guard: must be active.
  pure def pStandUp(s: State): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, prone: false}}
    }
  }

  /// Go on hold: yield current turn, wait for opportunity.
  /// Guard: must be on own turn, not shaken, not stunned, active.
  pure def pGoOnHold(s: State): {success: bool, newState: State} = {
    if (not(s.ownTurn) or s.shaken or s.stunned or not(s.isActive())) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, ownTurn: false, onHold: true}}
    }
  }

  /// Interrupt another character's action while on hold.
  /// athleticsRoll >= 1: success (act before interruptee)
  /// athleticsRoll < 1: fail (act after interruptee — still gets turn)
  /// Either way, hold is consumed and character gets own turn.
  pure def pInterrupt(s: State, athleticsRoll: int): {success: bool, newState: State} = {
    if (not(s.onHold)) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, onHold: false, ownTurn: true}}
    }
  }

  /// Apply entangled. Guard: isActive. Sets restrained = max(restrained, 0).
  pure def pApplyEntangled(s: State): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, restrained: max(s.restrained, 0)}}
    }
  }

  /// Apply bound. Guard: isActive. Sets restrained = 1.
  /// Also cascades: sets distracted + vulnerable timers. Clears grapple if any.
  pure def pApplyBound(s: State): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      val timer = if (s.ownTurn) 1 else 0
      {success: true, newState: {...s,
        restrained: 1,
        grappledBy: "",
        distracted: max(s.distracted, timer),
        vulnerable: max(s.vulnerable, timer)
      }}
    }
  }

  /// Escape attempt from restraint (entangled/bound only, not grapple).
  /// From bound: success (>= 1) → entangled, raise (>= 2) → free
  /// From entangled: success (>= 1) → free
  pure def pEscapeAttempt(s: State, rollResult: int): {success: bool, newState: State} = {
    if (s.restrained < 0 or s.restrained >= 2) {
      // Free or grappled — use pGrappleEscape for grapple
      {success: false, newState: s}
    } else if (s.restrained == 1) {
      // Bound
      if (rollResult >= 2) {
        {success: true, newState: {...s, restrained: -1}}
      } else if (rollResult >= 1) {
        {success: true, newState: {...s, restrained: 0}}
      } else {
        {success: false, newState: s}
      }
    } else {
      // Entangled
      if (rollResult >= 1) {
        {success: true, newState: {...s, restrained: -1}}
      } else {
        {success: false, newState: s}
      }
    }
  }

  /// Grapple attempt by opponent. Guard: isActive, not already grappled.
  /// Mutual exclusion: grapple replaces any existing restraint (entangled/bound).
  /// success (>= 1) → grabbed, raise (>= 2) → pinned.
  /// Sets distracted + vulnerable (like bound).
  pure def pGrappleAttempt(s: State, rollResult: int, opponent: str): {success: bool, newState: State} = {
    if (not(s.isActive()) or s.restrained >= 2 or rollResult < 1) {
      {success: false, newState: s}
    } else {
      val timer = if (s.ownTurn) 1 else 0
      val newRestrained = if (rollResult >= 2) 3 else 2
      {success: true, newState: {...s,
        restrained: newRestrained,
        grappledBy: opponent,
        distracted: max(s.distracted, timer),
        vulnerable: max(s.vulnerable, timer)
      }}
    }
  }

  /// Escape from grapple (grabbed/pinned).
  /// From pinned: success → grabbed, raise → free.
  /// From grabbed: success → free.
  pure def pGrappleEscape(s: State, rollResult: int): {success: bool, newState: State} = {
    if (s.restrained < 2 or rollResult < 1) {
      {success: false, newState: s}
    } else if (s.restrained == 3) {
      // Pinned
      if (rollResult >= 2) {
        // Raise: free entirely
        {success: true, newState: {...s, restrained: -1, grappledBy: ""}}
      } else {
        // Success: step down to grabbed
        {success: true, newState: {...s, restrained: 2}}
      }
    } else {
      // Grabbed: success → free
      {success: true, newState: {...s, restrained: -1, grappledBy: ""}}
    }
  }

  /// Pin attempt: upgrade grabbed → pinned on success.
  pure def pPinAttempt(s: State, rollResult: int): {success: bool, newState: State} = {
    if (s.restrained != 2 or rollResult < 1) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, restrained: 3}}
    }
  }

  /// Fear table result: maps d20 roll + modifier to list of event strings.
  /// Returns event type names that the game layer dispatches.
  /// "ADRENALINE" = joker-like bonus (game layer), "HINDRANCE_xxx" = game layer.
  pure def fearTableResult(roll: int, modifier: int): List[str] = {
    val total = roll + modifier
    if (total <= 3) List("ADRENALINE")
    else if (total <= 6) List("APPLY_DISTRACTED")
    else if (total <= 9) List("APPLY_VULNERABLE")
    else if (total <= 12) List("APPLY_STUNNED")
    else if (total == 13) List("APPLY_STUNNED", "HINDRANCE_SCAR")
    else if (total <= 15) List("HINDRANCE_SLOWNESS")
    else if (total <= 17) List("APPLY_STUNNED", "PANIC_FLEE")
    else if (total <= 19) List("HINDRANCE_MINOR_PHOBIA")
    else if (total <= 21) List("HINDRANCE_MAJOR_PHOBIA")
    else List("HEART_ATTACK")
  }

  /// Apply blinded condition. severity: 2 = impaired, 4 = blinded.
  /// Guard: isActive. Severity only increases (max).
  pure def pApplyBlinded(s: State, severity: int): {success: bool, newState: State} = {
    if (not(s.isActive())) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, blinded: max(s.blinded, severity)}}
    }
  }

  /// Apply affliction (poison/disease). Guard: not dead.
  /// type: "paralytic", "weak", "lethal", "sleep"
  /// duration: number of turns (>= 0)
  pure def pApplyAffliction(s: State, aType: str, duration: int): {success: bool, newState: State} = {
    if (s.dead) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, afflictionType: aType, afflictionTimer: duration}}
    }
  }

  /// Cure affliction: clear type and timer.
  pure def pCureAffliction(s: State): {success: bool, newState: State} = {
    if (s.afflictionType == "none") {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, afflictionType: "none", afflictionTimer: -1}}
    }
  }

  /// Apply a power effect (buff/debuff with duration).
  /// Appends to activeEffects list.
  pure def pApplyEffect(s: State, etype: str, duration: int): {success: bool, newState: State} = {
    if (s.dead or duration <= 0) {
      {success: false, newState: s}
    } else {
      {success: true, newState: {...s, activeEffects: s.activeEffects.append({etype: etype, timer: duration})}}
    }
  }

  /// Dismiss a specific power effect by type (removes first match).
  pure def pDismissEffect(s: State, etype: str): {success: bool, newState: State} = {
    val hasMatch = s.activeEffects.foldl(false, (acc, e) => acc or e.etype == etype)
    if (not(hasMatch)) {
      {success: false, newState: s}
    } else {
      // Remove first match: collect elements, skip first matching one
      val result = s.activeEffects.foldl({found: false, kept: List()}, (acc, e) =>
        if (not(acc.found) and e.etype == etype) {...acc, found: true}
        else {...acc, kept: acc.kept.append(e)}
      )
      {success: true, newState: {...s, activeEffects: result.kept}}
    }
  }

  /// Backlash: clear all active effects + apply 1 fatigue.
  pure def pBacklash(s: State): {success: bool, newState: State} = {
    if (s.dead or s.activeEffects.length() == 0) {
      {success: false, newState: s}
    } else {
      val cleared = {...s, activeEffects: List()}
      val r = pApplyFatigue(cleared)
      {success: true, newState: r.newState}
    }
  }

  // ============================================================
  // 4. STATE VARIABLE
  // ============================================================

  var state: State

  // ============================================================
  // 5. INVARIANTS
  // ============================================================

  /// Wounds within valid range
  val woundsBounded = state.wounds >= 0 and state.wounds <= state.maxWounds

  /// Fatigue within valid range
  val fatigueBounded = state.fatigue >= 0 and state.fatigue <= 2

  /// Can't bleed out without being incapacitated
  val bleedingImpliesIncap = state.bleedingOut implies state.incapacitated

  /// Fatigue-incap only when fatigue is at max
  val fatigueIncapConsistent = state.incapByFatigue implies state.fatigue >= 2

  /// Extras with wounds must be dead
  val extraWoundsDead = (not(state.isWildCard) and state.wounds > 0) implies state.dead

  /// Condition timers never go below -1
  val timersValid = state.distracted >= -1 and state.vulnerable >= -1

  /// Prone only when active (not dead, not incapacitated)
  val proneImpliesActive = state.prone implies state.isActive()

  /// Hold only when active, not shaken, not stunned
  val holdImpliesActive = state.onHold implies (state.isActive() and not(state.shaken) and not(state.stunned))

  /// Bound/grabbed/pinned implies distracted and vulnerable
  val boundImpliesConditions = (state.restrained >= 1) implies (state.isDistracted() and state.isVulnerable())

  /// Restrained implies active
  val restrainedImpliesActive = (state.restrained >= 0) implies state.isActive()

  /// Restrained range valid (-1 to 3: free, entangled, bound, grabbed, pinned)
  val restrainedValid = state.restrained >= -1 and state.restrained <= 3

  /// Grabbed/pinned implies grappledBy is set
  val grappledByConsistent = (state.restrained >= 2) implies (state.grappledBy != "")

  /// grappledBy empty when not grabbed/pinned
  val grappledByEmpty = (state.restrained < 2) implies (state.grappledBy == "")

  /// Blinded within valid range
  val blindedValid = state.blinded >= 0 and state.blinded <= 4

  /// Blinded implies active
  val blindedImpliesActive = (state.blinded > 0) implies state.isActive()

  /// Injuries are valid strings (all entries are recognized injury types)
  val VALID_INJURIES = Set("unmentionables", "arm", "guts_broken", "guts_battered", "guts_busted", "leg", "head_scar", "head_blinded", "head_brain_damage")
  val injuriesValid = state.injuries.foldl(true, (acc, i) => acc and VALID_INJURIES.contains(i))

  /// Dead characters have no injuries (cleared on death)
  val deadClearsInjuries = state.dead implies state.injuries.length() == 0

  /// Affliction type is valid
  val VALID_AFFLICTIONS = Set("none", "paralytic", "weak", "lethal", "sleep")
  val afflictionTypeValid = VALID_AFFLICTIONS.contains(state.afflictionType)

  /// Affliction timer consistent with type
  val afflictionTimerConsistent = (state.afflictionType == "none") == (state.afflictionTimer == -1)

  /// Dead characters have no affliction
  val deadClearsAffliction = state.dead implies (state.afflictionType == "none" and state.afflictionTimer == -1)

  /// All active effects have positive timers (no expired entries linger)
  val activeEffectsValid = state.activeEffects.foldl(true, (acc, e) => acc and e.timer > 0)

  /// Active effect types are valid
  val VALID_EFFECT_TYPES = Set("armor", "shield", "smite", "boost", "lower_attribute", "speed", "fly")
  val activeEffectTypesValid = state.activeEffects.foldl(true, (acc, e) => acc and VALID_EFFECT_TYPES.contains(e.etype))

  /// Dead characters have no active effects
  val deadClearsEffects = state.dead implies state.activeEffects.length() == 0

  /// Combined safety invariant
  val safetyInv = and {
    woundsBounded,
    fatigueBounded,
    bleedingImpliesIncap,
    fatigueIncapConsistent,
    extraWoundsDead,
    timersValid,
    proneImpliesActive,
    holdImpliesActive,
    boundImpliesConditions,
    restrainedImpliesActive,
    restrainedValid,
    grappledByConsistent,
    grappledByEmpty,
    blindedValid,
    blindedImpliesActive,
    injuriesValid,
    deadClearsInjuries,
    afflictionTypeValid,
    afflictionTimerConsistent,
    deadClearsAffliction,
    activeEffectsValid,
    activeEffectTypesValid,
    deadClearsEffects
  }

  // Action witnesses (should be VIOLATED = reachable)
  val canReachShaken = not(state.shaken)
  val canReachWounded = not(state.wounds > 0)
  val canReachIncapacitated = not(state.incapacitated)
  val canReachDead = not(state.dead)
  val canReachStunned = not(state.stunned)

  // ============================================================
  // 6. ACTIONS
  // ============================================================

  action doTakeDamage(margin: int, soak: int, incapRoll: int, injuryRoll: int): bool = {
    val r = pTakeDamage(state, margin, soak, incapRoll, injuryRoll)
    all { r.success, state' = r.newState }
  }

  action doStartOfTurn(vigorRoll: int, spiritRoll: int): bool = {
    val r = pStartOfTurn(state, vigorRoll, spiritRoll)
    all { r.success, state' = r.newState }
  }

  action doEndOfTurn: bool = {
    val r = pEndOfTurn(state)
    all { r.success, state' = r.newState }
  }

  action doUnshake: bool = {
    val r = pUnshake(state)
    all { r.success, state' = r.newState }
  }

  action doApplyStunned: bool = {
    val r = pApplyStunned(state)
    all { r.success, state' = r.newState }
  }

  action doApplyDistracted: bool = {
    val r = pApplyDistracted(state)
    all { r.success, state' = r.newState }
  }

  action doApplyVulnerable: bool = {
    val r = pApplyVulnerable(state)
    all { r.success, state' = r.newState }
  }

  action doApplyFatigue: bool = {
    val r = pApplyFatigue(state)
    all { r.success, state' = r.newState }
  }

  action doRecoverFatigue: bool = {
    val r = pRecoverFatigue(state)
    all { r.success, state' = r.newState }
  }

  action doHeal(amount: int): bool = {
    val r = pHeal(state, amount)
    all { r.success, state' = r.newState }
  }

  action doFinishingMove: bool = {
    val r = pFinishingMove(state)
    all { r.success, state' = r.newState }
  }

  action doDropProne: bool = {
    val r = pDropProne(state)
    all { r.success, state' = r.newState }
  }

  action doStandUp: bool = {
    val r = pStandUp(state)
    all { r.success, state' = r.newState }
  }

  action doGoOnHold: bool = {
    val r = pGoOnHold(state)
    all { r.success, state' = r.newState }
  }

  action doInterrupt(athleticsRoll: int): bool = {
    val r = pInterrupt(state, athleticsRoll)
    all { r.success, state' = r.newState }
  }

  action doApplyEntangled: bool = {
    val r = pApplyEntangled(state)
    all { r.success, state' = r.newState }
  }

  action doApplyBound: bool = {
    val r = pApplyBound(state)
    all { r.success, state' = r.newState }
  }

  action doEscapeAttempt(rollResult: int): bool = {
    val r = pEscapeAttempt(state, rollResult)
    all { r.success, state' = r.newState }
  }

  action doGrappleAttempt(rollResult: int, opponent: str): bool = {
    val r = pGrappleAttempt(state, rollResult, opponent)
    all { r.success, state' = r.newState }
  }

  action doGrappleEscape(rollResult: int): bool = {
    val r = pGrappleEscape(state, rollResult)
    all { r.success, state' = r.newState }
  }

  action doPinAttempt(rollResult: int): bool = {
    val r = pPinAttempt(state, rollResult)
    all { r.success, state' = r.newState }
  }

  action doApplyBlinded(severity: int): bool = {
    val r = pApplyBlinded(state, severity)
    all { r.success, state' = r.newState }
  }

  action doApplyAffliction(aType: str, duration: int): bool = {
    val r = pApplyAffliction(state, aType, duration)
    all { r.success, state' = r.newState }
  }

  action doCureAffliction: bool = {
    val r = pCureAffliction(state)
    all { r.success, state' = r.newState }
  }

  action doApplyEffect(etype: str, duration: int): bool = {
    val r = pApplyEffect(state, etype, duration)
    all { r.success, state' = r.newState }
  }

  action doDismissEffect(etype: str): bool = {
    val r = pDismissEffect(state, etype)
    all { r.success, state' = r.newState }
  }

  action doBacklash: bool = {
    val r = pBacklash(state)
    all { r.success, state' = r.newState }
  }

  // ============================================================
  // 7. INITIALIZATION
  // ============================================================

  action init = {
    nondet wc = Bool.oneOf()
    state' = if (wc) FRESH_WILD_CARD else FRESH_EXTRA
  }

  // ============================================================
  // 8. STEP ACTION
  // ============================================================

  action step = {
    if (state.dead) {
      state' = state
    } else {
      any {
        // Take damage from any source
        nondet margin = MARGINS.oneOf()
        nondet soak = SOAK_RANGE.oneOf()
        nondet incapRoll = ROLL_RANGE.oneOf()
        nondet injuryRoll = INJURY_ROLL_RANGE.oneOf()
        doTakeDamage(margin, soak, incapRoll, injuryRoll),

        // Start of turn (recovery attempts)
        nondet vigorRoll = 0.to(3).oneOf()
        nondet spiritRoll = 0.to(3).oneOf()
        doStartOfTurn(vigorRoll, spiritRoll),

        // End of turn (expire conditions)
        doEndOfTurn,

        // Spend benny to clear Shaken
        doUnshake,

        // External conditions
        doApplyStunned,
        doApplyDistracted,
        doApplyVulnerable,

        // Fatigue
        doApplyFatigue,
        doRecoverFatigue,

        // Healing
        nondet amount = HEAL_RANGE.oneOf()
        doHeal(amount),

        // Finishing move (dispatch helpless victim)
        doFinishingMove,

        // Prone
        doDropProne,
        doStandUp,

        // Hold / Interrupt
        doGoOnHold,
        nondet athleticsRoll = ROLL_RANGE.oneOf()
        doInterrupt(athleticsRoll),

        // Restraint
        doApplyEntangled,
        doApplyBound,
        nondet escapeRoll = ROLL_RANGE.oneOf()
        doEscapeAttempt(escapeRoll),

        // Blinded
        nondet blindSev = Set(2, 4).oneOf()
        doApplyBlinded(blindSev),

        // Grapple
        nondet grappleRoll = ROLL_RANGE.oneOf()
        doGrappleAttempt(grappleRoll, "opp1"),
        nondet grappleEscapeRoll = ROLL_RANGE.oneOf()
        doGrappleEscape(grappleEscapeRoll),
        nondet pinRoll = ROLL_RANGE.oneOf()
        doPinAttempt(pinRoll),

        // Afflictions
        nondet affType = Set("paralytic", "weak", "lethal", "sleep").oneOf()
        nondet affDuration = 0.to(3).oneOf()
        doApplyAffliction(affType, affDuration),
        doCureAffliction,

        // Power effects
        nondet effectType = VALID_EFFECT_TYPES.oneOf()
        nondet effectDuration = 1.to(5).oneOf()
        doApplyEffect(effectType, effectDuration),
        nondet dismissType = VALID_EFFECT_TYPES.oneOf()
        doDismissEffect(dismissType),
        doBacklash,
      }
    }
  }

  // ============================================================
  // TEMPORAL PROPERTIES
  // ============================================================

  /// Once dead, always dead
  temporal deadIsFinal = always(state.dead implies next(state.dead))
}
