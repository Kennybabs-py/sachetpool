// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Plain 18-decimals ERC20 with open mint, for tests only.
contract MockSach is ERC20 {
    constructor() ERC20("Sachet", "SACH") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
