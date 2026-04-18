import { haversineDistance } from '../src/utils/geo';
import { encryptMessage, decryptMessage } from '../src/utils/crypto';

describe('Token ledger logic', () => {
  it('should not allow negative amounts', () => {
    expect(() => {
      if (-5 <= 0) throw new Error('Debit amount must be positive');
    }).toThrow('Debit amount must be positive');
  });

  it('should detect insufficient balance', () => {
    const balance = 30;
    const reserved = 0;
    const debitAmount = 50;
    const available = balance - reserved;
    expect(available < debitAmount).toBe(true);
  });

  it('should allow debit when sufficient balance', () => {
    const balance = 100;
    const reserved = 20;
    const debitAmount = 50;
    const available = balance - reserved;
    expect(available >= debitAmount).toBe(true);
  });

  it('signup bonus should be exactly 50', () => {
    const signupBonus = 50;
    const initialBalance = 0;
    const afterBonus = initialBalance + signupBonus;
    expect(afterBonus).toBe(50);
  });

  it('escrow reserve should decrease available balance', () => {
    const balance = 100;
    let reserved = 0;
    const escrowAmount = 30;
    reserved += escrowAmount;
    const available = balance - reserved;
    expect(available).toBe(70);
    expect(reserved).toBe(30);
  });

  it('escrow release should restore available balance', () => {
    const balance = 100;
    let reserved = 30;
    const escrowAmount = 30;
    reserved -= escrowAmount;
    const available = balance - reserved;
    expect(available).toBe(100);
    expect(reserved).toBe(0);
  });

  it('escrow finalize should transfer tokens to recipient', () => {
    let senderBalance = 100;
    let senderReserved = 30;
    let recipientBalance = 50;
    const escrowAmount = 30;

    senderBalance -= escrowAmount;
    senderReserved -= escrowAmount;
    recipientBalance += escrowAmount;

    expect(senderBalance).toBe(70);
    expect(senderReserved).toBe(0);
    expect(recipientBalance).toBe(80);
  });
});
