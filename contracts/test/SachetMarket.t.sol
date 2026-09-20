// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SachetMarket} from "../src/SachetMarket.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SachetMarketTest is Test {
    SachetMarket internal market;
    MockERC20 internal token;

    address internal operator = address(0xA11CE);
    address internal treasury = address(0xB0B);
    address internal alice = address(0x1);
    address internal bob = address(0x2);
    address internal carol = address(0x3);
    address internal dave = address(0x4);

    // Mirror the contract's outcome codes as locals. Never call the contract's
    // constant getters inside an `expectRevert`/`prank` window: those getters are
    // external calls and would consume the cheatcode.
    uint8 internal constant HOME = 1;
    uint8 internal constant DRAW = 2;
    uint8 internal constant AWAY = 3;
    uint8 internal constant VOID = 4;
    uint16 internal constant MAX_RAKE = 1000;

    uint256 internal constant MIN_STAKE = 1e18;
    uint16 internal constant RAKE = 500; // 5%

    bytes32 internal constant POOL = keccak256("sachet:1x2:test");
    uint64 internal expiry;

    function setUp() public {
        token = new MockERC20();
        market = new SachetMarket(
            address(token),
            treasury,
            operator,
            MIN_STAKE
        );
        expiry = uint64(block.timestamp + 1 days);

        address[4] memory users = [alice, bob, carol, dave];
        for (uint256 i = 0; i < users.length; i++) {
            token.mint(users[i], 10_000e18);
            vm.prank(users[i]);
            token.approve(address(market), type(uint256).max);
        }
    }

    function _create() internal {
        vm.prank(operator);
        market.createPool(POOL, expiry, RAKE);
    }

    function _bet(address who, uint8 selection, uint256 amount) internal {
        vm.prank(who);
        market.bet(POOL, selection, amount);
    }

    // ── createPool ────────────────────────────────────────────────────────

    function test_CreatePool_StoresConfig() public {
        _create();
        SachetMarket.Pool memory p = market.getPool(POOL);
        assertTrue(p.exists);
        assertEq(p.expiresAt, expiry);
        assertEq(p.rakeBps, RAKE);
        assertEq(p.outcome, 0);
        assertFalse(p.resolved);
    }

    function test_CreatePool_RevertsForNonOperator() public {
        vm.expectRevert(SachetMarket.NotOperator.selector);
        vm.prank(alice);
        market.createPool(POOL, expiry, RAKE);
    }

    function test_CreatePool_RevertsOnDuplicate() public {
        _create();
        vm.expectRevert(SachetMarket.PoolExists.selector);
        vm.prank(operator);
        market.createPool(POOL, expiry, RAKE);
    }

    function test_CreatePool_RevertsOnPastExpiry() public {
        vm.expectRevert(SachetMarket.ExpiryInPast.selector);
        vm.prank(operator);
        market.createPool(POOL, uint64(block.timestamp), RAKE);
    }

    function test_CreatePool_RevertsOnRakeTooHigh() public {
        vm.expectRevert(SachetMarket.RakeTooHigh.selector);
        vm.prank(operator);
        market.createPool(POOL, expiry, MAX_RAKE + 1);
    }

    // ── bet ───────────────────────────────────────────────────────────────

    function test_Bet_TransfersAndTracksStake() public {
        _create();
        uint256 before = token.balanceOf(alice);
        _bet(alice, HOME, 200e18);

        assertEq(token.balanceOf(alice), before - 200e18);
        assertEq(token.balanceOf(address(market)), 200e18);

        SachetMarket.Pool memory p = market.getPool(POOL);
        assertEq(p.totalStake, 200e18);
        assertEq(p.stakeBySelection[0], 200e18);

        (uint256 home, uint256 draw, uint256 away) = market.getUserStake(
            POOL,
            alice
        );
        assertEq(home, 200e18);
        assertEq(draw, 0);
        assertEq(away, 0);
    }

    function test_Bet_AccumulatesMultipleBets() public {
        _create();
        _bet(alice, HOME, 150e18);
        _bet(alice, HOME, 250e18);
        (uint256 home, , ) = market.getUserStake(POOL, alice);
        assertEq(home, 400e18);
    }

    function test_Bet_RevertsAfterExpiry() public {
        _create();
        vm.warp(expiry);
        vm.expectRevert(SachetMarket.BettingClosed.selector);
        vm.prank(alice);
        market.bet(POOL, HOME, 200e18);
    }

    function test_Bet_RevertsBelowMinStake() public {
        _create();
        vm.expectRevert(SachetMarket.StakeTooSmall.selector);
        vm.prank(alice);
        market.bet(POOL, HOME, MIN_STAKE - 1);
    }

    function test_Bet_RevertsInvalidSelection() public {
        _create();
        vm.expectRevert(SachetMarket.InvalidSelection.selector);
        vm.prank(alice);
        market.bet(POOL, 0, 200e18);

        vm.expectRevert(SachetMarket.InvalidSelection.selector);
        vm.prank(alice);
        market.bet(POOL, 4, 200e18);
    }

    function test_Bet_RevertsWhenPoolMissing() public {
        vm.expectRevert(SachetMarket.PoolMissing.selector);
        vm.prank(alice);
        market.bet(POOL, HOME, 200e18);
    }

    // ── resolve ───────────────────────────────────────────────────────────

    function test_Resolve_RevertsForNonOperator() public {
        _create();
        _bet(alice, HOME, 200e18);
        vm.warp(expiry);
        vm.expectRevert(SachetMarket.NotOperator.selector);
        vm.prank(alice);
        market.resolve(POOL, HOME);
    }

    function test_Resolve_RevertsBeforeExpiry() public {
        _create();
        _bet(alice, HOME, 200e18);
        vm.expectRevert(SachetMarket.PoolNotExpired.selector);
        vm.prank(operator);
        market.resolve(POOL, HOME);
    }

    function test_Resolve_RevertsDoubleResolve() public {
        _create();
        _bet(alice, HOME, 200e18);
        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, HOME);

        vm.expectRevert(SachetMarket.AlreadyResolved.selector);
        vm.prank(operator);
        market.resolve(POOL, HOME);
    }

    function test_Resolve_RevertsInvalidOutcome() public {
        _create();
        _bet(alice, HOME, 200e18);
        vm.warp(expiry);
        vm.expectRevert(SachetMarket.InvalidOutcome.selector);
        vm.prank(operator);
        market.resolve(POOL, 5);
    }

    // ── claim ─────────────────────────────────────────────────────────────

    function test_Claim_ProportionalSplit() public {
        _create();
        _bet(alice, HOME, 100e18);
        _bet(bob, HOME, 50e18);
        _bet(carol, AWAY, 30e18);
        _bet(dave, DRAW, 20e18);

        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, HOME);

        // total 200e18, rake floor(200e18*5%) = 10e18, distributable 190e18,
        // winning stake 150e18.
        uint256 distributable =
            200e18 -
            (200e18 * uint256(RAKE)) /
            10_000;
        uint256 alicePayout = (distributable * 100e18) / 150e18;
        uint256 bobPayout = (distributable * 50e18) / 150e18;

        vm.prank(alice);
        market.claim(POOL);
        assertEq(token.balanceOf(alice), 10_000e18 - 100e18 + alicePayout);

        vm.prank(bob);
        market.claim(POOL);
        assertEq(token.balanceOf(bob), 10_000e18 - 50e18 + bobPayout);

        assertEq(market.treasuryBalance(), 10e18);
        // The pot keeps the rake plus whatever rounding dust the floors left.
        uint256 dust = distributable - alicePayout - bobPayout;
        assertEq(token.balanceOf(address(market)), 10e18 + dust);
    }

    function test_Claim_RevertsDoubleClaim() public {
        _create();
        _bet(alice, HOME, 100e18);
        _bet(bob, AWAY, 100e18);
        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, HOME);

        vm.prank(alice);
        market.claim(POOL);

        vm.expectRevert(SachetMarket.AlreadyClaimed.selector);
        vm.prank(alice);
        market.claim(POOL);
    }

    function test_Claim_LoserRevertsNothingToClaim() public {
        _create();
        _bet(alice, HOME, 100e18);
        _bet(bob, AWAY, 100e18);
        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, HOME);

        vm.expectRevert(SachetMarket.NothingToClaim.selector);
        vm.prank(bob);
        market.claim(POOL);
    }

    function test_Claim_RevertsBeforeResolve() public {
        _create();
        _bet(alice, HOME, 100e18);
        vm.expectRevert(SachetMarket.NotResolved.selector);
        vm.prank(alice);
        market.claim(POOL);
    }

    function test_Claim_StrangerReverts() public {
        _create();
        _bet(alice, HOME, 100e18);
        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, HOME);

        address stranger = address(0x99);
        vm.expectRevert(SachetMarket.NothingToClaim.selector);
        vm.prank(stranger);
        market.claim(POOL);
    }

    // ── refunds ───────────────────────────────────────────────────────────

    function test_Void_RefundsEveryoneNoRake() public {
        _create();
        _bet(alice, HOME, 100e18);
        _bet(bob, AWAY, 50e18);
        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, VOID);

        vm.prank(alice);
        market.claim(POOL);
        assertEq(token.balanceOf(alice), 10_000e18);
        vm.prank(bob);
        market.claim(POOL);
        assertEq(token.balanceOf(bob), 10_000e18);
        assertEq(market.treasuryBalance(), 0);
    }

    function test_NoWinners_RefundsEveryoneNoRake() public {
        _create();
        _bet(alice, HOME, 100e18);
        _bet(bob, DRAW, 50e18);
        vm.warp(expiry);
        // AWAY wins but nobody backed it.
        vm.prank(operator);
        market.resolve(POOL, AWAY);

        SachetMarket.Pool memory p = market.getPool(POOL);
        assertTrue(p.refundMode);
        assertEq(p.treasuryCredit, 0);

        vm.prank(alice);
        market.claim(POOL);
        assertEq(token.balanceOf(alice), 10_000e18);
    }

    // ── treasury ──────────────────────────────────────────────────────────

    function test_WithdrawTreasury_OnlyOperator() public {
        _create();
        _bet(alice, HOME, 100e18);
        _bet(bob, AWAY, 100e18);
        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, HOME);

        vm.expectRevert(SachetMarket.NotOperator.selector);
        vm.prank(alice);
        market.withdrawTreasury(treasury);

        vm.prank(operator);
        market.withdrawTreasury(treasury);
        assertEq(token.balanceOf(treasury), 10e18);
        assertEq(market.treasuryBalance(), 0);
    }

    // ── fuzz ──────────────────────────────────────────────────────────────

    /// @dev Across any split, a winning bettor can never pull out more than the
    ///      distributable pot — dust stays in the contract.
    function testFuzz_ClaimSumNeverExceedsDistributable(
        uint96 homeAmt,
        uint96 drawAmt,
        uint96 awayAmt,
        uint16 rakeBps
    ) public {
        uint256 h = bound(uint256(homeAmt), MIN_STAKE, 1_000_000e18);
        uint256 d = bound(uint256(drawAmt), MIN_STAKE, 1_000_000e18);
        uint256 a = bound(uint256(awayAmt), MIN_STAKE, 1_000_000e18);
        uint16 rake = uint16(bound(uint256(rakeBps), 0, MAX_RAKE));

        address p1 = address(0x101);
        address p2 = address(0x102);
        address p3 = address(0x103);
        token.mint(p1, h);
        token.mint(p2, d);
        token.mint(p3, a);
        vm.prank(p1);
        token.approve(address(market), type(uint256).max);
        vm.prank(p2);
        token.approve(address(market), type(uint256).max);
        vm.prank(p3);
        token.approve(address(market), type(uint256).max);

        bytes32 pid = bytes32("fuzz");
        vm.prank(operator);
        market.createPool(pid, uint64(block.timestamp + 1 hours), rake);

        vm.prank(p1);
        market.bet(pid, HOME, h);
        vm.prank(p2);
        market.bet(pid, DRAW, d);
        vm.prank(p3);
        market.bet(pid, AWAY, a);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(operator);
        market.resolve(pid, HOME);

        uint256 total = h + d + a;
        uint256 rakeAmt = (total * rake) / market.BPS_DENOMINATOR();
        uint256 distributable = total - rakeAmt;

        vm.prank(p1);
        market.claim(pid);

        // p1 staked `h` (leaving balance 0), so its balance is now the payout.
        uint256 paid = token.balanceOf(p1);
        assertLe(paid, distributable);
        assertLe(market.treasuryBalance(), rakeAmt);
        // Contract retains the rake plus any rounding dust.
        assertGe(token.balanceOf(address(market)), rakeAmt);
    }

    /// @dev A refund (void, or a result nobody backed) returns the exact stake.
    function testFuzz_RefundAlwaysReturnsExactStake(
        uint96 amount,
        uint8 outcome
    ) public {
        uint256 amt = bound(uint256(amount), MIN_STAKE, 1_000e18);
        uint8 out = uint8(bound(uint256(outcome), 1, 4));

        _create();
        _bet(alice, HOME, amt);
        vm.warp(expiry);
        vm.prank(operator);
        market.resolve(POOL, out);

        vm.prank(alice);
        market.claim(POOL);

        // Alice staked `amt` on HOME and started with 10,000e18. She is refunded
        // in full when the outcome is VOID or nobody backed it; when HOME wins
        // she takes the whole pot back minus the rake.
        if (out == HOME) {
            uint256 rakeAmt = (amt * RAKE) / market.BPS_DENOMINATOR();
            assertEq(token.balanceOf(alice), 10_000e18 - rakeAmt);
        } else {
            assertEq(token.balanceOf(alice), 10_000e18);
        }
    }
}
