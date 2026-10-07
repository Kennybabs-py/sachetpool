// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {SachetMarket} from "../src/SachetMarket.sol";
import {MockSach} from "./mocks/MockSach.sol";
import {SachetMarketHandler} from "./SachetMarketHandler.sol";

/// @notice Stateful invariant tests for SachetMarket.
/// @dev The payout oracle in `_payout` re-implements the claim math independently
///      of the contract, so a bug in `claim` cannot hide behind itself.
contract SachetMarketInvariants is Test {
    SachetMarket internal market;
    MockSach internal token;
    SachetMarketHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal resolver = makeAddr("resolver");

    function setUp() public {
        token = new MockSach();
        market = new SachetMarket(address(token), admin, 5);

        bytes32 role = market.RESOLVER_ROLE(); // read before prank
        vm.prank(admin);
        market.grantRole(role, resolver);

        handler = new SachetMarketHandler(market, token, admin, resolver);

        // seed two pools so the fuzzer has something to bet on immediately
        handler.launchPool(0);
        handler.launchPool(1 days);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](10);
        selectors[0] = handler.launchPool.selector;
        selectors[1] = handler.placeBet.selector;
        selectors[2] = handler.withdrawBet.selector;
        selectors[3] = handler.advanceTime.selector;
        selectors[4] = handler.resolvePool.selector;
        selectors[5] = handler.cancelPool.selector;
        selectors[6] = handler.claim.selector;
        selectors[7] = handler.setRake.selector;
        selectors[8] = handler.togglePause.selector;
        selectors[9] = handler.donate.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // ------------------------------------------------------------------
    // 1. SOLVENCY: the market always holds enough to honour every claim
    // ------------------------------------------------------------------

    /// @dev OPEN pool        -> every active stake must be refundable or payable.
    ///      RESOLVED/CANCELLED -> every unclaimed payout must be covered.
    function invariant_solvency() public view {
        assertGe(token.balanceOf(address(market)), _totalLiabilities(), "market is insolvent");
    }

    // ------------------------------------------------------------------
    // 2. CONSERVATION: token balance equals the independent ghost ledger
    // ------------------------------------------------------------------

    function invariant_ledgerConservation() public view {
        uint256 expected =
            handler.ghostDeposited() + handler.ghostDonated() - handler.ghostWithdrawn() - handler.ghostPaid();
        assertEq(token.balanceOf(address(market)), expected, "balance != deposits - withdrawals - payouts");
    }

    // ------------------------------------------------------------------
    // 3. POOL ACCOUNTING: totals match both their parts and the bets
    // ------------------------------------------------------------------

    function invariant_poolTotalsMatchParts() public view {
        for (uint256 i = 0; i < handler.poolCount(); i++) {
            bytes32 id = handler.poolIdAt(i);
            SachetMarket.Pool memory p = market.getPool(id);
            assertEq(p.poolHome + p.poolDraw + p.poolAway, p.totalPool, "outcome pools != totalPool");
        }
    }

    function invariant_poolTotalsMatchBets() public view {
        for (uint256 i = 0; i < handler.poolCount(); i++) {
            bytes32 id = handler.poolIdAt(i);
            SachetMarket.Pool memory p = market.getPool(id);

            uint256 home;
            uint256 draw;
            uint256 away;
            for (uint256 j = 0; j < handler.actorCount(); j++) {
                SachetMarket.Bet memory b = market.getUserStake(id, handler.actorAt(j));
                if (b.amount == 0) continue;
                if (b.outcome == SachetMarket.Outcome.HOME) home += b.amount;
                else if (b.outcome == SachetMarket.Outcome.DRAW) draw += b.amount;
                else if (b.outcome == SachetMarket.Outcome.AWAY) away += b.amount;
            }
            assertEq(home, p.poolHome, "HOME pool != sum of HOME bets");
            assertEq(draw, p.poolDraw, "DRAW pool != sum of DRAW bets");
            assertEq(away, p.poolAway, "AWAY pool != sum of AWAY bets");
        }
    }

    // ------------------------------------------------------------------
    // 4. POOL ISOLATION: a pool can never pay out more than its own pot
    // ------------------------------------------------------------------

    function invariant_poolNeverPaysMoreThanItsPot() public view {
        for (uint256 i = 0; i < handler.poolCount(); i++) {
            SachetMarket.Pool memory p = market.getPool(handler.poolIdAt(i));

            if (p.status == SachetMarket.PoolStatus.OPEN) {
                assertEq(p.totalClaimed, 0, "payout from an OPEN pool");
            } else if (p.status == SachetMarket.PoolStatus.CANCELLED || p.result == SachetMarket.Outcome.VOID) {
                assertLe(p.totalClaimed, p.totalPool, "refunds exceed stakes");
            } else {
                assertLe(p.totalClaimed, _distributable(p), "payouts exceed pot minus rake");
            }
        }
    }

    // ------------------------------------------------------------------
    // 5. RAKE SNAPSHOT: later setRakeBps never touches existing pools
    // ------------------------------------------------------------------

    function invariant_rakeSnapshotIsImmutable() public view {
        for (uint256 i = 0; i < handler.poolCount(); i++) {
            bytes32 id = handler.poolIdAt(i);
            assertEq(market.getPool(id).rakeBps, handler.ghostPoolRake(id), "pool rake changed after launch");
        }
    }

    // ------------------------------------------------------------------
    // 6. STATE MACHINE: finalized pools never change; LOCKED is never stored
    // ------------------------------------------------------------------

    function invariant_finalStateIsTerminal() public view {
        assertFalse(handler.ghostRefinalized(), "a finalized pool was finalized again");

        for (uint256 i = 0; i < handler.poolCount(); i++) {
            bytes32 id = handler.poolIdAt(i);
            SachetMarket.Pool memory p = market.getPool(id);

            assertTrue(p.status != SachetMarket.PoolStatus.LOCKED, "LOCKED persisted in storage");

            if (handler.ghostFinal(id)) {
                assertEq(uint8(p.status), uint8(handler.ghostFinalStatus(id)), "final status changed");
                assertEq(uint8(p.result), uint8(handler.ghostFinalResult(id)), "final result changed");
            }
        }
    }

    // ------------------------------------------------------------------
    // 7. NO DOUBLE CLAIM
    // ------------------------------------------------------------------

    function invariant_noDoubleClaim() public view {
        for (uint256 i = 0; i < handler.poolCount(); i++) {
            bytes32 id = handler.poolIdAt(i);
            for (uint256 j = 0; j < handler.actorCount(); j++) {
                assertLe(handler.ghostClaimCount(id, handler.actorAt(j)), 1, "claimed more than once");
            }
        }
    }

    // ------------------------------------------------------------------
    // 8. DUST BOUND: once every winner has claimed, floor-rounding loss is
    //    strictly less than 1 wei per winner. Rake + dust is all that remains.
    // ------------------------------------------------------------------

    function invariant_roundingLossIsBounded() public view {
        for (uint256 i = 0; i < handler.poolCount(); i++) {
            SachetMarket.Pool memory p = market.getPool(handler.poolIdAt(i));
            if (p.status != SachetMarket.PoolStatus.RESOLVED || p.result == SachetMarket.Outcome.VOID) continue;
            if (_winningPool(p) == 0) continue; // house-wins pools: nothing to distribute

            bytes32 id = handler.poolIdAt(i);
            uint256 winners;
            bool allClaimed = true;
            for (uint256 j = 0; j < handler.actorCount(); j++) {
                SachetMarket.Bet memory b = market.getUserStake(id, handler.actorAt(j));
                if (b.amount > 0 && b.outcome == p.result) {
                    winners++;
                    if (!b.claimed) allClaimed = false;
                }
            }
            if (!allClaimed || winners == 0) continue;

            assertLt(_distributable(p) - p.totalClaimed, winners, "rounding loss > 1 wei per winner");
        }
    }

    // ------------------------------------------------------------------
    // Reachability report (run with -vv): confirms the actions really fire
    // ------------------------------------------------------------------

    function afterInvariant() public view {
        console2.log("launchPool  ", handler.calls("launchPool"));
        console2.log("placeBet    ", handler.calls("placeBet"));
        console2.log("withdrawBet ", handler.calls("withdrawBet"));
        console2.log("advanceTime ", handler.calls("advanceTime"));
        console2.log("resolvePool ", handler.calls("resolvePool"));
        console2.log("cancelPool  ", handler.calls("cancelPool"));
        console2.log("claim       ", handler.calls("claim"));
        console2.log("setRake     ", handler.calls("setRake"));
        console2.log("togglePause ", handler.calls("togglePause"));
        console2.log("donate      ", handler.calls("donate"));
    }

    // ------------------------------------------------------------------
    // Independent oracle
    // ------------------------------------------------------------------

    function _totalLiabilities() internal view returns (uint256 sum) {
        for (uint256 i = 0; i < handler.poolCount(); i++) {
            bytes32 id = handler.poolIdAt(i);
            SachetMarket.Pool memory p = market.getPool(id);

            for (uint256 j = 0; j < handler.actorCount(); j++) {
                SachetMarket.Bet memory b = market.getUserStake(id, handler.actorAt(j));
                if (b.amount == 0 || b.claimed) continue;

                if (p.status == SachetMarket.PoolStatus.OPEN) {
                    sum += b.amount; // worst case: refunded in full
                } else {
                    sum += _payout(p, b);
                }
            }
        }
    }

    function _payout(SachetMarket.Pool memory p, SachetMarket.Bet memory b) internal pure returns (uint256) {
        if (p.status == SachetMarket.PoolStatus.CANCELLED || p.result == SachetMarket.Outcome.VOID) {
            return b.amount;
        }
        if (b.outcome != p.result) return 0;

        uint256 winning = _winningPool(p);
        if (winning == 0) return 0;
        return (_distributable(p) * b.amount) / winning;
    }

    function _distributable(SachetMarket.Pool memory p) internal pure returns (uint256) {
        return p.totalPool - (p.totalPool * p.rakeBps) / 10000;
    }

    function _winningPool(SachetMarket.Pool memory p) internal pure returns (uint256) {
        if (p.result == SachetMarket.Outcome.HOME) return p.poolHome;
        if (p.result == SachetMarket.Outcome.DRAW) return p.poolDraw;
        if (p.result == SachetMarket.Outcome.AWAY) return p.poolAway;
        return 0;
    }
}
