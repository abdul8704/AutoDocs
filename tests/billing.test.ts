import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { BillingService } from "../src/billing/billing.service";

describe("BillingService Unit Tests", () => {
    test("usdToCredits converts USD amounts accurately", () => {
        // $0.01 per credit
        assert.equal(BillingService.usdToCredits(0.01), 1);
        assert.equal(BillingService.usdToCredits(0.10), 10);
        assert.equal(BillingService.usdToCredits(1.00), 100);
        assert.equal(BillingService.usdToCredits(0.00), 0);
        assert.equal(BillingService.usdToCredits(-5.00), 0);
    });

    test("creditsToUsd converts credits to USD accurately", () => {
        assert.equal(BillingService.creditsToUsd(1), 0.01);
        assert.equal(BillingService.creditsToUsd(10), 0.10);
        assert.equal(BillingService.creditsToUsd(100), 1.00);
        assert.equal(BillingService.creditsToUsd(0), 0.00);
    });

    test("providerCostToCredits applies 30% markup and rounds up to integer credits", () => {
        // $0.01 cost * 1.30 margin = $0.013 -> ceil(0.013 / 0.01) = 2 credits
        assert.equal(BillingService.providerCostToCredits(0.01), 2);
        // $0.05 cost * 1.30 margin = $0.065 -> ceil(0.065 / 0.01) = 7 credits
        assert.equal(BillingService.providerCostToCredits(0.05), 7);
        // $0.00 cost -> 0 credits
        assert.equal(BillingService.providerCostToCredits(0), 0);
    });

    test("creditsToProviderSpendCapacity calculates spend capacity with markup", () => {
        // 10 credits = $0.10 retail / 1.30 = $0.0769
        assert.equal(BillingService.creditsToProviderSpendCapacity(10), 0.0769);
        assert.equal(BillingService.creditsToProviderSpendCapacity(0), 0.00);
    });
});
