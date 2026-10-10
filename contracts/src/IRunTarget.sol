// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IRunTarget
/// @notice Sketch of the "plug in your protocol" interface for the business slide. Not deployed, not used by RunBank.
///         Any protocol that can answer these four calls can be run through the RUN! harness: the same rumor
///         model (offchain, deterministic) decides who tries to exit, the harness submits the exits in blocks,
///         and `solvency()` is the bank-maths verdict (PRD section 9) generalised to "can this protocol still pay?".
///
///         Examples: a lending pool (deposit = supply, requestWithdraw = withdraw), an LST/LRT redemption queue,
///         a stablecoin redeemer, a yield vault with an exit queue, a perp-DEX LP vault.
interface IRunTarget {
    /// @notice Put funds in on behalf of `who`. Returns the claim size credited (shares, balance, ...).
    function deposit(address who, uint256 amount) external returns (uint256 claim);

    /// @notice `who` asks to leave. May pay immediately, queue (speed bump), or revert when impossible.
    /// @return paidNow amount actually paid in this call (0 if queued)
    function requestWithdraw(address who, uint256 amount) external returns (uint256 paidNow);

    /// @notice Pay out whatever the protocol's exit policy allows this block (queue draining, per-block caps).
    /// @return paid total paid in this call
    function processWithdrawals(uint256 maxItems) external returns (uint256 paid);

    /// @notice Liquid + realisable assets versus what is owed, in base units, plus the current exit haircut.
    /// @return liquid assets that can be paid right now
    /// @return realisable liquid + everything sellable at the current haircut
    /// @return owed total claims outstanding
    /// @return haircutBps the discount currently applied to forced sales (0..10_000)
    function solvency() external view returns (uint256 liquid, uint256 realisable, uint256 owed, uint16 haircutBps);
}
