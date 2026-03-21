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
    ownTurn: bool
  }

  // ============================================================
  // 2. CONSTANTS
  // ============================================================

  pure val FRESH_WILD_CARD: State = {
    shaken: false, stunned: false, distracted: -1, vulnerable: -1,
    wounds: 0, incapacitated: false, bleedingOut: false, dead: false,
    fatigue: 0, incapByFatigue: false,
    isWildCard: true, maxWounds: 3, ownTurn: false
  }

  pure val FRESH_EXTRA: State = {
    shaken: false, stunned: false, distracted: -1, vulnerable: -1,
    wounds: 0, incapacitated: false, bleedingOut: false, dead: false,
    fatigue: 0, incapByFatigue: false,
    isWildCard: false, maxWounds: 1, ownTurn: false
  }

  // Bounded ranges for nondeterministic exploration
  pure val MARGINS = 0.to(15)       // damage - toughness (negatives are no-ops)
  pure val SOAK_RANGE = 0.to(4)     // 0 = no soak or failed, 1+ = wounds soaked
  pure val ROLL_RANGE = (-1).to(3)  // -1 = critfail, 0 = fail, 1 = success, 2+ = raises
  pure val HEAL_RANGE = 1.to(3)

  // ============================================================
  // 3. PURE FUNCTIONS
  // ============================================================

  // --- Helpers ---
  pure def max(a: int, b: int): int = if (a > b) a else b

  /// Clear all conditions when dying — dead is absorbing, no residual state
  pure def die(s: State): State = {
    ...s, dead: true, shaken: false, stunned: false,
    distracted: -1, vulnerable: -1,
    incapacitated: false, bleedingOut: false,
    fatigue: 0, incapByFatigue: false
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
  pure def pTakeDamage(
    s: State,
    margin: int,
    soakSuccesses: int,
    incapRoll: int
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
        val base = {...s, wounds: s.maxWounds, shaken: false, stunned: false, incapacitated: true}
        if (incapRoll < 0) {
          {success: true, newState: die(base)}
        } else if (incapRoll == 0) {
          {success: true, newState: {...base, bleedingOut: true}}
        } else {
          // Success/raise: incapacitated with injury (injury table out of scope)
          {success: true, newState: base}
        }
      } else {
        {success: true, newState: {...s, wounds: newWounds, shaken: newShaken}}
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
    if (s.dead or s.ownTurn) {
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
    } else if (s.incapacitated or s.incapByFatigue) {
      // Incapacitated but stable — no per-turn recovery (daily recovery out of scope)
      {success: true, newState: {...s, ownTurn: true}}
    } else {
      // Active: attempt Stunned and Shaken recovery independently
      val s1 = {...s, ownTurn: true}

      // Stunned recovery (Vigor check)
      val s2 = if (s1.stunned) {
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

      {success: true, newState: s3}
    }
  }

  /// End of turn: expire timed conditions, transition to others' turns.
  pure def pEndOfTurn(s: State): {success: bool, newState: State} = {
    if (not(s.ownTurn)) {
      {success: false, newState: s}
    } else {
      val nd = if (s.distracted > 0) s.distracted - 1
               else if (s.distracted == 0) -1
               else -1
      val nv = if (s.vulnerable > 0) s.vulnerable - 1
               else if (s.vulnerable == 0) -1
               else -1
      {success: true, newState: {...s, ownTurn: false, distracted: nd, vulnerable: nv}}
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
      {success: true, newState: {...s, stunned: true, distracted: max(s.distracted, timer)}}
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
      {success: true, newState: {...s, incapByFatigue: true}}
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

  /// Combined safety invariant
  val safetyInv = and {
    woundsBounded,
    fatigueBounded,
    bleedingImpliesIncap,
    fatigueIncapConsistent,
    extraWoundsDead,
    timersValid
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

  action doTakeDamage(margin: int, soak: int, incapRoll: int): bool = {
    val r = pTakeDamage(state, margin, soak, incapRoll)
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
        doTakeDamage(margin, soak, incapRoll),

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
      }
    }
  }

  // ============================================================
  // TEMPORAL PROPERTIES
  // ============================================================

  /// Once dead, always dead
  temporal deadIsFinal = always(state.dead implies next(state.dead))
}
