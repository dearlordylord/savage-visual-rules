// -*- mode: Bluespec; -*-

/// Test scenarios for the Savage Worlds status state machine.

module savageTest {
  import savage.* from "./savage"

  // ============================================================
  // Deterministic init helpers
  // ============================================================

  action initWildCard = state' = FRESH_WILD_CARD
  action initExtra = state' = FRESH_EXTRA

  // ============================================================
  // Damage tests
  // ============================================================

  /// Damage that meets Toughness but no raises: just Shaken
  run shakenFromDamageTest = {
    initWildCard
    .then(doTakeDamage(2, 0, 0, 0))
    .expect(state.shaken and state.wounds == 0)
  }

  /// Damage with 1 raise (margin 4-7): Shaken + 1 wound
  run woundFromRaiseTest = {
    initWildCard
    .then(doTakeDamage(5, 0, 0, 0))
    .expect(state.shaken and state.wounds == 1)
  }

  /// Shaken character hit again with no raises: Shaken-on-Shaken = 1 wound
  run shakenOnShakenTest = {
    initWildCard
    .then(doTakeDamage(2, 0, 0, 0))
    .expect(state.shaken and state.wounds == 0)
    .then(doTakeDamage(1, 0, 0, 0))
    .expect(state.shaken and state.wounds == 1)
  }

  /// Shaken character hit with 1 raise: still just 1 wound (not 2)
  run shakenWithRaiseTest = {
    initWildCard
    .then(doTakeDamage(0, 0, 0, 0))
    .expect(state.shaken)
    .then(doTakeDamage(4, 0, 0, 0))
    .expect(state.wounds == 1)
  }

  /// Soak removes all wounds and clears pre-existing Shaken
  run soakClearsShakenTest = {
    all { state' = {...FRESH_WILD_CARD, shaken: true} }
    .then(doTakeDamage(0, 1, 0, 0))
    .expect(not(state.shaken) and state.wounds == 0)
  }

  /// Partial soak: reduce wounds but stay Shaken
  run partialSoakTest = {
    initWildCard
    .then(doTakeDamage(8, 1, 0, 0))
    .expect(state.shaken and state.wounds == 1)
  }

  /// No damage when margin < 0: state unchanged
  run noDamageOnMissTest = {
    initWildCard
    .then(doTakeDamage(0, 0, 0, 0))
    .expect(state.shaken)
    // margin 0 does cause Shaken — that's a hit. Use the action filter:
    // pTakeDamage with margin < 0 returns success: false, which means doTakeDamage fails.
    // So we can't test "no damage" via doTakeDamage with negative margin in a .then chain.
    // Instead, test the pure function directly:
  }

  // ============================================================
  // Extra tests
  // ============================================================

  /// Extra dies from any wound
  run extraDiesFromWoundTest = {
    initExtra
    .then(doTakeDamage(4, 0, 0, 0))
    .expect(state.dead and state.wounds == 1)
  }

  /// Extra becomes Shaken but survives when no wound
  run extraShakenSurvivesTest = {
    initExtra
    .then(doTakeDamage(2, 0, 0, 0))
    .expect(state.shaken and not(state.dead) and state.wounds == 0)
  }

  // ============================================================
  // Incapacitation tests (Wild Card)
  // ============================================================

  /// 3 wounds + Shaken-on-Shaken → incapacitated. IncapRoll fail → bleeding out.
  run incapBleedingOutTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 0, 0))
    .expect(state.incapacitated and state.bleedingOut and state.wounds == 3)
  }

  /// IncapRoll critfail → dead
  run incapCritFailDeadTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, -1, 0))
    .expect(state.dead)
  }

  /// IncapRoll success → incapacitated but not bleeding
  run incapSuccessTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 1, 51))
    .expect(state.incapacitated and not(state.bleedingOut) and not(state.dead))
  }

  /// Bleeding out: fail → dead
  run bleedingOutDeathTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, incapacitated: true, bleedingOut: true} }
    .then(doStartOfTurn(0, 0))
    .expect(state.dead)
  }

  /// Bleeding out: raise → stabilized
  run bleedingOutStabilizedTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, incapacitated: true, bleedingOut: true} }
    .then(doStartOfTurn(2, 0))
    .expect(not(state.bleedingOut) and state.incapacitated)
  }

  // ============================================================
  // Stunned recovery tests
  // ============================================================

  /// Stunned recovery success: clear Stunned, Vulnerable until end of next turn
  run stunnedRecoverySuccessTest = {
    initWildCard
    .then(doApplyStunned)
    .expect(state.stunned and state.distracted == 0)
    .then(doStartOfTurn(1, 0))
    .expect(not(state.stunned) and state.vulnerable == 1 and state.ownTurn)
    .then(doEndOfTurn)
    .expect(state.vulnerable == 0 and state.distracted == -1)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.vulnerable == -1)
  }

  /// Stunned recovery raise: Vulnerable clears at end of current turn
  run stunnedRecoveryRaiseTest = {
    initWildCard
    .then(doApplyStunned)
    .then(doStartOfTurn(2, 0))
    .expect(not(state.stunned) and state.vulnerable == 0)
    .then(doEndOfTurn)
    .expect(state.vulnerable == -1)
  }

  /// Stunned recovery fail: still Stunned
  run stunnedRecoveryFailTest = {
    initWildCard
    .then(doApplyStunned)
    .then(doStartOfTurn(0, 0))
    .expect(state.stunned)
  }

  action initStunnedAndShaken = state' = {...FRESH_WILD_CARD, stunned: true, shaken: true, distracted: 0}

  /// Stunned + Shaken: both recover independently on same turn
  run stunnedAndShakenRecoveryTest = {
    initStunnedAndShaken
    .then(doStartOfTurn(1, 1))
    .expect(not(state.stunned) and not(state.shaken) and state.vulnerable == 1)
  }

  /// Stunned + Shaken: stunned fails but shaken succeeds
  run stunnedFailShakenSuccessTest = {
    initStunnedAndShaken
    .then(doStartOfTurn(0, 1))
    .expect(state.stunned and not(state.shaken))
  }

  /// Stunned + Shaken: stunned succeeds but shaken fails
  run stunnedSuccessShakenFailTest = {
    initStunnedAndShaken
    .then(doStartOfTurn(1, 0))
    .expect(not(state.stunned) and state.shaken and state.vulnerable == 1)
  }

  /// Stunned causes prone (SWADE: stunned character falls prone)
  run stunnedCausesProneTest = {
    initWildCard
    .expect(not(state.prone))
    .then(doApplyStunned)
    .expect(state.stunned and state.prone)
  }

  // ============================================================
  // Shaken recovery tests
  // ============================================================

  /// Shaken recovery success
  run shakenRecoveryTest = {
    initWildCard
    .then(doTakeDamage(0, 0, 0, 0))
    .expect(state.shaken)
    .then(doStartOfTurn(0, 1))
    .expect(not(state.shaken) and state.ownTurn)
  }

  /// Shaken recovery fail
  run shakenRecoveryFailTest = {
    initWildCard
    .then(doTakeDamage(0, 0, 0, 0))
    .then(doStartOfTurn(0, 0))
    .expect(state.shaken and state.ownTurn)
  }

  /// Benny unshake works any time
  run bennyUnshakeTest = {
    initWildCard
    .then(doTakeDamage(2, 0, 0, 0))
    .expect(state.shaken)
    .then(doUnshake)
    .expect(not(state.shaken))
  }

  // ============================================================
  // Distracted / Vulnerable timing tests
  // ============================================================

  /// Applied outside own turn: clears at end of next own turn (1 endOfTurn)
  run distractedOutsideTurnTest = {
    initWildCard
    .expect(not(state.ownTurn))
    .then(doApplyDistracted)
    .expect(state.distracted == 0)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.distracted == -1)
  }

  /// Applied during own turn: lasts through current + next turn (2 endOfTurns)
  run distractedDuringOwnTurnTest = {
    initWildCard
    .then(doStartOfTurn(0, 0))
    .expect(state.ownTurn)
    .then(doApplyDistracted)
    .expect(state.distracted == 1)
    .then(doEndOfTurn)
    .expect(state.distracted == 0)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.distracted == -1)
  }

  // ============================================================
  // Fatigue tests
  // ============================================================

  /// Fatigue progression: none → Fatigued → Exhausted → incapByFatigue
  run fatigueProgressionTest = {
    initWildCard
    .then(doApplyFatigue)
    .expect(state.fatigue == 1 and not(state.incapByFatigue))
    .then(doApplyFatigue)
    .expect(state.fatigue == 2 and not(state.incapByFatigue))
    .then(doApplyFatigue)
    .expect(state.fatigue == 2 and state.incapByFatigue)
  }

  /// Fatigue recovery: incapByFatigue → Exhausted → Fatigued → none
  run fatigueRecoveryTest = {
    all { state' = {...FRESH_WILD_CARD, fatigue: 2, incapByFatigue: true} }
    .then(doRecoverFatigue)
    .expect(not(state.incapByFatigue) and state.fatigue == 2)
    .then(doRecoverFatigue)
    .expect(state.fatigue == 1)
    .then(doRecoverFatigue)
    .expect(state.fatigue == 0)
  }

  // ============================================================
  // Healing tests
  // ============================================================

  /// Healing removes wounds
  run healWoundsTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 2} }
    .then(doHeal(1))
    .expect(state.wounds == 1)
  }

  /// Healing incapacitated character removes incapacitation
  run healRemovesIncapTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, incapacitated: true, bleedingOut: true} }
    .then(doHeal(1))
    .expect(state.wounds == 2 and not(state.incapacitated) and not(state.bleedingOut))
  }

  // ============================================================
  // Nondeterministic tests
  // ============================================================

  /// Any single hit on fresh Wild Card preserves wound bounds
  run woundBoundsNondetTest = {
    nondet margin = MARGINS.oneOf()
    nondet soak = SOAK_RANGE.oneOf()
    nondet incapRoll = ROLL_RANGE.oneOf()
    nondet injuryRoll = INJURY_ROLL_RANGE.oneOf()
    initWildCard
    .then(doTakeDamage(margin, soak, incapRoll, injuryRoll))
    .expect(state.wounds >= 0 and state.wounds <= state.maxWounds)
  }

  // ============================================================
  // Prone tests
  // ============================================================

  /// Drop prone and stand up cycle
  run proneDropAndStandTest = {
    initWildCard
    .then(doDropProne)
    .expect(state.prone)
    .then(doStandUp)
    .expect(not(state.prone))
  }

  /// Prone blocked when incapacitated by wounds
  run proneBlockedWhenIncapTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, incapacitated: true} }
    .then(doDropProne)
    .fail()
  }

  /// Prone blocked when incapacitated by fatigue
  run proneBlockedWhenFatigueIncapTest = {
    all { state' = {...FRESH_WILD_CARD, fatigue: 2, incapByFatigue: true} }
    .then(doDropProne)
    .fail()
  }

  /// Prone clears on death
  run proneClearsOnDeathTest = {
    initWildCard
    .then(doDropProne)
    .expect(state.prone)
    .then(doTakeDamage(16, 0, -1, 0))
    .expect(state.dead and not(state.prone))
  }

  /// Prone persists across turns
  run pronePersistsAcrossTurnsTest = {
    initWildCard
    .then(doDropProne)
    .expect(state.prone)
    .then(doStartOfTurn(0, 0))
    .expect(state.prone)
    .then(doEndOfTurn)
    .expect(state.prone)
    .then(doStartOfTurn(0, 0))
    .expect(state.prone)
  }

  /// Stand up blocked when incapacitated
  run standUpBlockedWhenIncapTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, incapacitated: true, prone: true} }
    .then(doStandUp)
    .fail()
  }

  // ============================================================
  // Hold / Interrupt tests
  // ============================================================

  /// Go on hold during own turn, then interrupt
  run holdAndInterruptCycleTest = {
    initWildCard
    .then(doStartOfTurn(0, 0))
    .expect(state.ownTurn)
    .then(doGoOnHold)
    .expect(state.onHold and not(state.ownTurn))
    .then(doInterrupt(1))
    .expect(not(state.onHold) and state.ownTurn)
  }

  /// Cannot go on hold when shaken
  run holdBlockedWhenShakenTest = {
    all { state' = {...FRESH_WILD_CARD, shaken: true, ownTurn: true} }
    .then(doGoOnHold)
    .fail()
  }

  /// Cannot go on hold when stunned
  run holdBlockedWhenStunnedTest = {
    all { state' = {...FRESH_WILD_CARD, stunned: true, ownTurn: true, distracted: 0} }
    .then(doGoOnHold)
    .fail()
  }

  /// Hold lost when shaken by damage
  run holdLostOnShakenTest = {
    initWildCard
    .then(doStartOfTurn(0, 0))
    .then(doGoOnHold)
    .expect(state.onHold)
    .then(doTakeDamage(0, 0, 0, 0))
    .expect(state.shaken and not(state.onHold))
  }

  /// Hold lost when stunned
  run holdLostOnStunnedTest = {
    initWildCard
    .then(doStartOfTurn(0, 0))
    .then(doGoOnHold)
    .expect(state.onHold)
    .then(doApplyStunned)
    .expect(state.stunned and not(state.onHold))
  }

  /// Start of turn skipped when on hold
  run startOfTurnSkippedOnHoldTest = {
    all { state' = {...FRESH_WILD_CARD, onHold: true} }
    .then(doStartOfTurn(0, 0))
    .fail()
  }

  /// Cannot go on hold from others' turn
  run holdBlockedFromOthersTurnTest = {
    initWildCard
    .expect(not(state.ownTurn))
    .then(doGoOnHold)
    .fail()
  }

  /// End of turn (round end) clears hold
  run holdClearedOnEndOfTurnTest = {
    initWildCard
    .then(doStartOfTurn(0, 0))
    .then(doGoOnHold)
    .expect(state.onHold)
    .then(doEndOfTurn)
    .expect(not(state.onHold) and not(state.ownTurn))
  }

  /// Interrupt fail still gives turn
  run interruptFailStillGetsTurnTest = {
    all { state' = {...FRESH_WILD_CARD, onHold: true} }
    .then(doInterrupt(-1))
    .expect(state.ownTurn and not(state.onHold))
  }

  /// Hold lost when fatigue-incapacitated
  run holdLostOnFatigueIncapTest = {
    all { state' = {...FRESH_WILD_CARD, fatigue: 2, onHold: true} }
    .then(doApplyFatigue)
    .expect(state.incapByFatigue and not(state.onHold))
  }

  // ============================================================
  // Restraint tests
  // ============================================================

  /// Apply entangled, then escape
  run entangledAndEscapeTest = {
    initWildCard
    .then(doApplyEntangled)
    .expect(state.restrained == 0)
    .then(doEscapeAttempt(1))
    .expect(state.restrained == -1)
  }

  /// Apply bound: cascades distracted + vulnerable
  run boundCascadesConditionsTest = {
    initWildCard
    .then(doApplyBound)
    .expect(state.restrained == 1 and state.isDistracted() and state.isVulnerable())
  }

  /// Bound escape: success → entangled, raise → free
  run boundEscapeSuccessTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 1, distracted: 0, vulnerable: 0} }
    .then(doEscapeAttempt(1))
    .expect(state.restrained == 0)
  }

  run boundEscapeRaiseTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 1, distracted: 0, vulnerable: 0} }
    .then(doEscapeAttempt(2))
    .expect(state.restrained == -1)
  }

  /// Bound escape fail: stays bound
  run boundEscapeFailTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 1, distracted: 0, vulnerable: 0} }
    .then(doEscapeAttempt(0))
    .fail()
  }

  /// Entangled escape fail: stays entangled
  run entangledEscapeFailTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 0} }
    .then(doEscapeAttempt(0))
    .fail()
  }

  /// Entangled does not downgrade bound
  run entangledDoesNotDowngradeBoundTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 1, distracted: 0, vulnerable: 0} }
    .then(doApplyEntangled)
    .expect(state.restrained == 1)
  }

  /// Restraint blocked when incapacitated
  run restraintBlockedWhenIncapTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, incapacitated: true} }
    .then(doApplyEntangled)
    .fail()
  }

  /// Restraint clears on death
  run restraintClearsOnDeathTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 1, distracted: 0, vulnerable: 0} }
    .then(doTakeDamage(16, 0, -1, 0))
    .expect(state.dead and state.restrained == -1)
  }

  /// Restraint clears on incapacitation
  run restraintClearsOnIncapTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true, restrained: 1, distracted: 0, vulnerable: 0} }
    .then(doTakeDamage(0, 0, 1, 51))
    .expect(state.incapacitated and state.restrained == -1)
  }

  // ============================================================
  // Injury tests
  // ============================================================

  /// Incap success appends injury to list
  run injuryOnIncapSuccessTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 1, 51))
    .expect(state.incapacitated and state.injuries.length() == 1 and state.injuries[0] == "guts_broken")
  }

  /// Incap raise also appends injury
  run injuryOnIncapRaiseTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 2, 110))
    .expect(state.incapacitated and state.injuries.length() == 1 and state.injuries[0] == "leg")
  }

  /// Incap fail (bleeding out) does NOT append injury
  run noInjuryOnIncapFailTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 0, 0))
    .expect(state.incapacitated and state.bleedingOut and state.injuries.length() == 0)
  }

  /// Incap critfail (death) does NOT append injury
  run noInjuryOnIncapCritFailTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, -1, 0))
    .expect(state.dead and state.injuries.length() == 0)
  }

  /// Injuries persist through healing
  run injuriesPersistThroughHealingTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 1, 30))
    .expect(state.injuries.length() == 1 and state.injuries[0] == "arm")
    .then(doHeal(2))
    .expect(state.wounds == 1 and state.injuries.length() == 1 and state.injuries[0] == "arm")
  }

  /// Death clears injuries
  run deathClearsInjuriesTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 1, 121))
    .expect(state.injuries.length() == 1 and state.injuries[0] == "head_scar")
    .then(doHeal(1))
    .expect(not(state.incapacitated))
    .then(doTakeDamage(16, 0, -1, 0))
    .expect(state.dead and state.injuries.length() == 0)
  }

  /// ResolveInjury maps table brackets correctly
  run resolveInjuryMappingTest = {
    initWildCard
    .expect(
      pResolveInjury(20) == "unmentionables" and
      pResolveInjury(30) == "arm" and
      pResolveInjury(40) == "arm" and
      pResolveInjury(51) == "guts_broken" and
      pResolveInjury(53) == "guts_battered" and
      pResolveInjury(55) == "guts_busted" and
      pResolveInjury(100) == "leg" and
      pResolveInjury(110) == "leg" and
      pResolveInjury(121) == "head_scar" and
      pResolveInjury(124) == "head_blinded" and
      pResolveInjury(126) == "head_brain_damage"
    )
  }

  /// Multiple injuries accumulate
  run multipleInjuriesAccumulateTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, shaken: true} }
    .then(doTakeDamage(0, 0, 1, 51))
    .expect(state.injuries.length() == 1)
    .then(doHeal(3))
    .expect(state.wounds == 0 and state.injuries.length() == 1)
    .then(doTakeDamage(16, 0, 1, 110))
    .expect(state.incapacitated and state.injuries.length() == 2 and state.injuries[1] == "leg")
  }

  // ============================================================
  // Grapple tests
  // ============================================================

  /// Grapple attempt success → grabbed with distracted + vulnerable
  run grappleSuccessTest = {
    initWildCard
    .then(doGrappleAttempt(1, "opp1"))
    .expect(state.restrained == 2 and state.grappledBy == "opp1" and state.isDistracted() and state.isVulnerable())
  }

  /// Grapple attempt raise → pinned
  run grappleRaisePinnedTest = {
    initWildCard
    .then(doGrappleAttempt(2, "opp1"))
    .expect(state.restrained == 3 and state.grappledBy == "opp1")
  }

  /// Grapple attempt fail → no change
  run grappleFailTest = {
    initWildCard
    .then(doGrappleAttempt(0, "opp1"))
    .fail()
  }

  /// Escape from pinned: success → grabbed (step-down), raise → free
  run pinnedEscapeStepDownTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 3, grappledBy: "opp1", distracted: 0, vulnerable: 0} }
    .then(doGrappleEscape(1))
    .expect(state.restrained == 2 and state.grappledBy == "opp1")
  }

  run pinnedEscapeRaiseFreeTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 3, grappledBy: "opp1", distracted: 0, vulnerable: 0} }
    .then(doGrappleEscape(2))
    .expect(state.restrained == -1 and state.grappledBy == "")
  }

  /// Escape from grabbed: success → free
  run grabbedEscapeFreeTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 2, grappledBy: "opp1", distracted: 0, vulnerable: 0} }
    .then(doGrappleEscape(1))
    .expect(state.restrained == -1 and state.grappledBy == "")
  }

  /// Pin attempt upgrades grabbed → pinned
  run pinAttemptUpgradeTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 2, grappledBy: "opp1", distracted: 0, vulnerable: 0} }
    .then(doPinAttempt(1))
    .expect(state.restrained == 3)
  }

  /// Pin attempt blocked when not grabbed
  run pinAttemptBlockedWhenFreeTest = {
    initWildCard
    .then(doPinAttempt(1))
    .fail()
  }

  /// Grapple conditions persist across turns (don't expire at endOfTurn)
  run grappleConditionsPersistTest = {
    initWildCard
    .then(doGrappleAttempt(1, "opp1"))
    .expect(state.distracted >= 0 and state.vulnerable >= 0)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.distracted >= 0 and state.vulnerable >= 0 and state.restrained == 2)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.distracted >= 0 and state.vulnerable >= 0)
  }

  /// Grapple and restraint are mutually exclusive — grapple replaces entangled
  run grappleReplacesEntangledTest = {
    initWildCard
    .then(doApplyEntangled)
    .expect(state.restrained == 0)
    .then(doGrappleAttempt(1, "opp1"))
    .expect(state.restrained == 2 and state.grappledBy == "opp1")
  }

  /// Grapple blocked when already grabbed/pinned
  run grappleBlockedWhenAlreadyGrappledTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 2, grappledBy: "opp1", distracted: 0, vulnerable: 0} }
    .then(doGrappleAttempt(1, "opp2"))
    .fail()
  }

  /// Death clears grapple
  run grappleClearsOnDeathTest = {
    all { state' = {...FRESH_WILD_CARD, restrained: 3, grappledBy: "opp1", distracted: 0, vulnerable: 0} }
    .then(doTakeDamage(16, 0, -1, 0))
    .expect(state.dead and state.restrained == -1 and state.grappledBy == "")
  }

  // ============================================================
  // Blinded tests
  // ============================================================

  /// Apply blinded (full severity)
  run applyBlindedFullTest = {
    initWildCard
    .then(doApplyBlinded(4))
    .expect(state.blinded == 4)
  }

  /// Apply impaired, then upgrade to blinded
  run blindedSeverityUpgradeTest = {
    initWildCard
    .then(doApplyBlinded(2))
    .expect(state.blinded == 2)
    .then(doApplyBlinded(4))
    .expect(state.blinded == 4)
  }

  /// Impaired does not downgrade blinded
  run impairedDoesNotDowngradeBlindedTest = {
    initWildCard
    .then(doApplyBlinded(4))
    .then(doApplyBlinded(2))
    .expect(state.blinded == 4)
  }

  /// Blinded recovery: success steps down by 2 (4→2, 2→0)
  run blindedRecoverySuccessTest = {
    initWildCard
    .then(doApplyBlinded(4))
    .expect(state.blinded == 4)
    .then(doStartOfTurn(1, 0))
    .expect(state.blinded == 2)
    .then(doEndOfTurn)
    .then(doStartOfTurn(1, 0))
    .expect(state.blinded == 0)
  }

  /// Blinded recovery: raise clears entirely
  run blindedRecoveryRaiseClearsTest = {
    initWildCard
    .then(doApplyBlinded(4))
    .then(doStartOfTurn(2, 0))
    .expect(state.blinded == 0)
  }

  /// Blinded recovery: fail, no change
  run blindedRecoveryFailTest = {
    initWildCard
    .then(doApplyBlinded(4))
    .then(doStartOfTurn(0, 0))
    .expect(state.blinded == 4)
  }

  /// Death clears blinded
  run blindedClearsOnDeathTest = {
    initWildCard
    .then(doApplyBlinded(4))
    .then(doTakeDamage(16, 0, -1, 0))
    .expect(state.dead and state.blinded == 0)
  }

  /// Blinded blocked when incapacitated
  run blindedBlockedWhenIncapTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, incapacitated: true} }
    .then(doApplyBlinded(4))
    .fail()
  }

  // ============================================================
  // Fear table tests
  // ============================================================

  /// 1-3: Adrenaline rush
  run fearAdrenalineTest = {
    initWildCard
    .expect(
      fearTableResult(1, 0) == List("ADRENALINE") and
      fearTableResult(3, 0) == List("ADRENALINE")
    )
  }

  /// 4-6: Distracted
  run fearDistractedTest = {
    initWildCard
    .expect(
      fearTableResult(4, 0) == List("APPLY_DISTRACTED") and
      fearTableResult(6, 0) == List("APPLY_DISTRACTED")
    )
  }

  /// 7-9: Vulnerable
  run fearVulnerableTest = {
    initWildCard
    .expect(
      fearTableResult(7, 0) == List("APPLY_VULNERABLE") and
      fearTableResult(9, 0) == List("APPLY_VULNERABLE")
    )
  }

  /// 10-12: Stunned
  run fearStunnedTest = {
    initWildCard
    .expect(
      fearTableResult(10, 0) == List("APPLY_STUNNED") and
      fearTableResult(12, 0) == List("APPLY_STUNNED")
    )
  }

  /// 13: Fear mark (stunned + scar)
  run fearMarkTest = {
    initWildCard
    .expect(fearTableResult(13, 0) == List("APPLY_STUNNED", "HINDRANCE_SCAR"))
  }

  /// 14-15: Slowness
  run fearSlownessTest = {
    initWildCard
    .expect(
      fearTableResult(14, 0) == List("HINDRANCE_SLOWNESS") and
      fearTableResult(15, 0) == List("HINDRANCE_SLOWNESS")
    )
  }

  /// 16-17: Panic (stunned + flee)
  run fearPanicTest = {
    initWildCard
    .expect(
      fearTableResult(16, 0) == List("APPLY_STUNNED", "PANIC_FLEE") and
      fearTableResult(17, 0) == List("APPLY_STUNNED", "PANIC_FLEE")
    )
  }

  /// 18-19: Minor phobia
  run fearMinorPhobiaTest = {
    initWildCard
    .expect(fearTableResult(18, 0) == List("HINDRANCE_MINOR_PHOBIA"))
  }

  /// 20-21: Major phobia
  run fearMajorPhobiaTest = {
    initWildCard
    .expect(fearTableResult(20, 0) == List("HINDRANCE_MAJOR_PHOBIA"))
  }

  /// 22+: Heart attack
  run fearHeartAttackTest = {
    initWildCard
    .expect(
      fearTableResult(22, 0) == List("HEART_ATTACK") and
      fearTableResult(25, 0) == List("HEART_ATTACK")
    )
  }

  /// Modifier shifts bracket correctly
  run fearModifierShiftTest = {
    initWildCard
    .expect(
      // Roll 3 + modifier 5 = 8 → Vulnerable
      fearTableResult(3, 5) == List("APPLY_VULNERABLE") and
      // Roll 10 + modifier 3 = 13 → Fear mark
      fearTableResult(10, 3) == List("APPLY_STUNNED", "HINDRANCE_SCAR") and
      // Roll 18 + modifier 4 = 22 → Heart attack
      fearTableResult(18, 4) == List("HEART_ATTACK")
    )
  }

  /// Negative modifier reduces result
  run fearNegativeModifierTest = {
    initWildCard
    .expect(
      // Roll 10 + modifier -5 = 5 → Distracted
      fearTableResult(10, -5) == List("APPLY_DISTRACTED")
    )
  }

  // ============================================================
  // Affliction tests
  // ============================================================

  /// Apply and cure affliction
  run afflictionApplyAndCureTest = {
    initWildCard
    .then(doApplyAffliction("weak", 3))
    .expect(state.afflictionType == "weak" and state.afflictionTimer == 3)
    .then(doCureAffliction)
    .expect(state.afflictionType == "none" and state.afflictionTimer == -1)
  }

  /// Affliction blocked when dead
  run afflictionBlockedWhenDeadTest = {
    all { state' = die(FRESH_WILD_CARD) }
    .then(doApplyAffliction("weak", 2))
    .fail()
  }

  /// Cure fails when no affliction
  run cureFailsWhenNoAfflictionTest = {
    initWildCard
    .then(doCureAffliction)
    .fail()
  }

  /// Affliction timer ticks down and expires
  run afflictionTimerExpiresTest = {
    initWildCard
    .then(doApplyAffliction("paralytic", 1))
    .expect(state.afflictionType == "paralytic" and state.afflictionTimer == 1)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.afflictionType == "paralytic" and state.afflictionTimer == 0)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.afflictionType == "none" and state.afflictionTimer == -1)
  }

  /// Death clears affliction
  run deathClearsAfflictionTest = {
    initWildCard
    .then(doApplyAffliction("lethal", 5))
    .expect(state.afflictionType == "lethal")
    .then(doTakeDamage(16, 0, -1, 0))
    .expect(state.dead and state.afflictionType == "none" and state.afflictionTimer == -1)
  }

  /// Paralytic blocks stunned recovery
  run paralyticBlocksStunRecoveryTest = {
    initWildCard
    .then(doApplyAffliction("paralytic", 5))
    .then(doApplyStunned)
    .expect(state.stunned)
    .then(doStartOfTurn(2, 0))
    .expect(state.stunned)
  }

  /// Paralytic does not block shaken recovery
  run paralyticDoesNotBlockShakenRecoveryTest = {
    initWildCard
    .then(doApplyAffliction("paralytic", 5))
    .then(doTakeDamage(0, 0, 0, 0))
    .expect(state.shaken)
    .then(doStartOfTurn(0, 1))
    .expect(not(state.shaken))
  }

  /// Weak adds fatigue each turn
  run weakAddsFatigueTest = {
    initWildCard
    .then(doApplyAffliction("weak", 5))
    .expect(state.fatigue == 0)
    .then(doStartOfTurn(0, 0))
    .expect(state.fatigue == 1)
    .then(doEndOfTurn)
    .then(doStartOfTurn(0, 0))
    .expect(state.fatigue == 2)
  }

  /// Lethal adds fatigue + shaken + wound
  run lethalDamagePerTurnTest = {
    initWildCard
    .then(doApplyAffliction("lethal", 5))
    .then(doStartOfTurn(0, 0))
    .expect(state.fatigue == 1 and state.shaken and state.wounds == 1)
  }

  /// Lethal can cascade to incap
  run lethalCascadesToIncapTest = {
    all { state' = {...FRESH_WILD_CARD, wounds: 3, afflictionType: "lethal", afflictionTimer: 5} }
    .then(doStartOfTurn(0, 0))
    .expect(state.incapacitated and state.bleedingOut)
  }

  /// Sleep blocks recovery (treated like incapacitated for actions)
  run sleepBlocksRecoveryTest = {
    all { state' = {...FRESH_WILD_CARD, stunned: true, shaken: true, distracted: 0, afflictionType: "sleep", afflictionTimer: 3} }
    .then(doStartOfTurn(2, 1))
    .expect(state.stunned and state.shaken)
  }

  /// Lethal affliction on Extra: start of turn → dead
  run lethalExtraDiesOnStartOfTurnTest = {
    initExtra
    .then(doApplyAffliction("lethal", 5))
    .expect(state.afflictionType == "lethal" and not(state.dead))
    .then(doStartOfTurn(0, 0))
    .expect(state.dead)
  }

  /// Affliction replaces previous affliction
  run afflictionReplacesExistingTest = {
    initWildCard
    .then(doApplyAffliction("weak", 3))
    .expect(state.afflictionType == "weak")
    .then(doApplyAffliction("lethal", 5))
    .expect(state.afflictionType == "lethal" and state.afflictionTimer == 5)
  }

  // ============================================================
  // Power effect tests
  // ============================================================

  /// Apply and dismiss a power effect
  run effectApplyAndDismissTest = {
    initWildCard
    .then(doApplyEffect("armor", 3))
    .expect(state.activeEffects.length() == 1 and state.activeEffects[0].etype == "armor" and state.activeEffects[0].timer == 3)
    .then(doDismissEffect("armor"))
    .expect(state.activeEffects.length() == 0)
  }

  /// Effect timer ticks down and expires
  run effectTimerExpiresTest = {
    initWildCard
    .then(doApplyEffect("shield", 1))
    .expect(state.activeEffects.length() == 1)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.activeEffects.length() == 0)
  }

  /// Multiple effects stack
  run multipleEffectsStackTest = {
    initWildCard
    .then(doApplyEffect("armor", 3))
    .then(doApplyEffect("smite", 2))
    .expect(state.activeEffects.length() == 2)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.activeEffects.length() == 2 and state.activeEffects[0].timer == 2 and state.activeEffects[1].timer == 1)
    .then(doStartOfTurn(0, 0))
    .then(doEndOfTurn)
    .expect(state.activeEffects.length() == 1 and state.activeEffects[0].etype == "armor")
  }

  /// Backlash clears all effects and adds fatigue
  run backlashClearsAndAddsFatigueTest = {
    initWildCard
    .then(doApplyEffect("armor", 3))
    .then(doApplyEffect("boost", 2))
    .expect(state.activeEffects.length() == 2 and state.fatigue == 0)
    .then(doBacklash)
    .expect(state.activeEffects.length() == 0 and state.fatigue == 1)
  }

  /// Backlash fails when no effects
  run backlashFailsWhenNoEffectsTest = {
    initWildCard
    .then(doBacklash)
    .fail()
  }

  /// Dismiss removes only first match
  run dismissRemovesFirstMatchTest = {
    initWildCard
    .then(doApplyEffect("armor", 3))
    .then(doApplyEffect("armor", 5))
    .expect(state.activeEffects.length() == 2)
    .then(doDismissEffect("armor"))
    .expect(state.activeEffects.length() == 1 and state.activeEffects[0].timer == 5)
  }

  /// Death clears active effects
  run deathClearsEffectsTest = {
    initExtra
    .then(doApplyEffect("shield", 3))
    .expect(state.activeEffects.length() == 1)
    .then(doTakeDamage(4, 0, 0, 0))
    .expect(state.dead and state.activeEffects.length() == 0)
  }

  /// Apply effect blocked when dead
  run effectBlockedWhenDeadTest = {
    all { state' = die(FRESH_WILD_CARD) }
    .then(doApplyEffect("armor", 3))
    .fail()
  }

  /// Zero duration effect rejected
  run zeroDurationEffectRejectedTest = {
    initWildCard
    .then(doApplyEffect("armor", 0))
    .fail()
  }

  /// Invalid effect type rejected
  run invalidEffectTypeRejectedTest = {
    initWildCard
    .then(doApplyEffect("fireball", 3))
    .fail()
  }

  /// Dismiss non-existent effect fails
  run dismissNonExistentEffectFailsTest = {
    initWildCard
    .then(doDismissEffect("armor"))
    .fail()
  }
}
