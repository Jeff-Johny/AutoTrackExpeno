/**
 * Deterministic, AI-free extraction of transaction fields from bank/UPI
 * SMS and email text. Indian bank notifications are machine-generated from
 * a small set of templates, so regex extraction is not just a fallback —
 * it's more predictable than an LLM for the formats it covers (no
 * hallucinated amounts). Add new patterns here as unfamiliar bank/UPI
 * formats show up; unmatched fields degrade to null rather than a guess.
 */

export type TransactionKind = 'debit' | 'credit' | 'none';

export interface ParsedTransaction {
  kind: TransactionKind;
  /** Always a positive magnitude — sign is applied by the caller based on `kind`. */
  amount: number | null;
  payee: string | null;
}

const OTP_KEYWORDS = ['otp', 'verification code', 'login code', 'security code', 'verify your'];
// Claim *status* updates ("registered", "intimation", "under process") are
// never a financial event regardless of wording elsewhere in the message —
// no money has moved yet. Distinct from a *settled* claim below, which is
// real money landing in the account and should be captured as a credit.
const CLAIM_STATUS_KEYWORDS = [
  'claim intimation', 'claim registered', 'claim number', 'claim id',
  'policy no', 'sum assured', 'claim status',
];
const DEBIT_KEYWORDS = ['debited', 'spent', 'paid', 'deducted', 'sent to', 'payment of', 'payment to', 'withdrawn', 'transferred'];
// Money coming IN — refunds for returned purchases, cashback, reversed
// transactions, and settled insurance claims all land here so they get
// tracked as a negative (subtracting) entry instead of silently dropped.
const CREDIT_KEYWORDS = [
  'credited', 'received from', 'refund', 'refunded', 'cashback', 'added to your',
  'received rs', 'reversed', 'reversal', 'claim settled', 'claim has been settled',
  'claim settlement', 'settlement of your claim',
];
const GENERAL_PAYMENT_KEYWORDS = ['vpa', 'upi', 'transaction', 'payment'];

/**
 * Checked in this order deliberately: OTP and bare claim-status updates are
 * never transactional, regardless of other wording in the message. Credit
 * is checked before debit — "credited"/"refund" is a stronger, more
 * specific signal than incidental "paid"/"payment" wording that can appear
 * in a credit message's boilerplate (e.g. "paid via the same method").
 */
export function classifyTransactionKind(text: string): TransactionKind {
  const lower = text.toLowerCase();
  if (OTP_KEYWORDS.some(kw => lower.includes(kw))) return 'none';
  if (CLAIM_STATUS_KEYWORDS.some(kw => lower.includes(kw))) return 'none';
  if (CREDIT_KEYWORDS.some(kw => lower.includes(kw))) return 'credit';
  if (DEBIT_KEYWORDS.some(kw => lower.includes(kw))) return 'debit';
  return GENERAL_PAYMENT_KEYWORDS.some(kw => lower.includes(kw)) ? 'debit' : 'none';
}

/** @deprecated kept for any external reference — prefer classifyTransactionKind(). */
export function isLikelySpendingText(text: string): boolean {
  return classifyTransactionKind(text) === 'debit';
}

const AMOUNT_PATTERNS = [
  // "debited by/of Rs 750.00" — keyword before amount
  /(?:debited|spent|paid|deducted|transferred|withdrawn)\s+(?:of|by)?[\s:]*(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i,
  // "Rs 100.00 debited" — amount before keyword
  /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)\s+(?:debited|spent|paid|deducted|transferred|withdrawn)/i,
  /amount[\s:]+(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i,
  // Fallback: first Rs/INR/₹ amount in the message (usually the transaction
  // amount appears before any "Avl Bal" mention in these templates).
  /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i,
];

export function extractAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0) return value;
    }
  }
  return null;
}

// Bare "to"/"at"/"for" anchors are unreliable on real bank SMS — those words
// show up constantly in boilerplate ("credited to A/c XXXX", "thank you for
// banking", "sent to your registered mobile") and a naive first-match grabs
// whichever one happens to come first in the message, not the merchant.
// These patterns require a stronger, more specific surrounding shape.
//
// Ordered by reliability, most specific first — the parenthetical pattern
// used to sit near the top and, because array order (not text position)
// decides which pattern wins, it routinely beat out the correct merchant
// match further down the message: almost every bank SMS has *some*
// parenthetical footer ("(HDFC Bank)", "(Ref no 998877)", dispute-line
// boilerplate), so it was grabbing that instead of "towards SWIGGY on..."
// or "paid ... to NETFLIX" appearing later in the same text. It's now
// last-resort only, with a stricter validity check (see below) so it
// still can't misfire as a bank name or reference number.
const PAYEE_PATTERNS = [
  // Card-present spend: "... at AMAZON on 08-Aug-26" — "at X on <date>" is a
  // near-unique shape in these templates.
  /\bat\s+([A-Za-z][A-Za-z0-9&.,'-]*(?:\s+[A-Za-z0-9&.,'-]+){0,4}?)\s+on\s+\d/i,
  // "debited ... towards/for AMAZON on <date>"
  /\b(?:towards|for)\s+([A-Za-z][A-Za-z0-9&.,'-]*(?:\s+[A-Za-z0-9&.,'-]+){0,4}?)\s+on\s+\d/i,
  // Spend verb followed (within a short window, e.g. "Sent Rs.150 from your
  // account to X") by "to X" — not "credited to", which points at a
  // destination account, not a merchant.
  /\b(?:paid|sent|transferred)\b[\s\S]{0,40}?\bto\s+([A-Za-z][A-Za-z0-9\s&.,'-]{1,40}?)(?:\s+(?:from|on|via|using)\b|[.,]|$)/i,
  // UPI reference format: UPI/P2M/<ref>/<MERCHANT>
  /UPI\/P2[MA]\/\d+\/([A-Za-z0-9\s&.,'-]{2,40}?)(?:[/.,\n]|$)/i,
  // "VPA merchant@bank (BENEFICIARY NAME)" — the parenthetical directly
  // after a VPA handle is the bank's own beneficiary-name display, high
  // confidence unlike a parenthetical anywhere else in the message. Tried
  // before the bare handle below so "(ZOMATO)" wins over the raw
  // "merchant" handle prefix when both are present.
  /vpa[:\s]+[a-z0-9.\-_]+@[a-z]+\s*\(([A-Za-z][A-Za-z0-9\s&.,'-]{1,40})\)/i,
  // VPA handle — the handle prefix isn't always the brand name, but it's
  // still the payer's actual counterparty, unlike the two fallbacks below.
  /vpa[:\s]+([a-z0-9.\-_]+)@[a-z]+/i,
  // Beneficiary name shown in parentheses, common in NEFT/IMPS/UPI SMS:
  // "... to VPA merchant@bank (AMAZON)" / "IMPS to A/c XXXX1234 (JOHN DOE)".
  // Last resort — see isValidPayeeCandidate for why this alone isn't
  // enough to keep it from misfiring on footer text.
  /\(([A-Za-z][A-Za-z0-9\s&.,'-]{1,40})\)/,
];

const PAYEE_STOPWORDS = new Set([
  'your', 'the', 'a', 'an', 'account', 'a/c', 'ac', 'bank', 'registered',
  'mobile', 'number', 'card', 'debit', 'credit', 'upi', 'vpa', 'rs', 'inr',
  'avl', 'bal', 'balance', 'limit', 'not', 'you', 'call', 'sms', 'ref',
]);

// Substrings that mark a candidate as bank/support boilerplate rather than
// an actual payee, even when it's a multi-word phrase that doesn't equal
// any single PAYEE_STOPWORDS entry outright (e.g. "HDFC Bank", "Ref no
// 998877", "Call 1800..."). Checked as a phrase-level filter — only used
// for the low-confidence parenthetical pattern, which is the one prone to
// grabbing this kind of text.
const PAYEE_BOILERPLATE_MARKERS = [
  'bank', 'call', 'dispute', 'helpline', 'customer care', 'toll free',
  'ref no', 'refno', 'ref.', 'ref:', 'sms', 'block', 'report', 'available',
  'balance', 'limit', 'not you', 'complain',
];

function isValidPayeeCandidate(candidate: string): boolean {
  if (candidate.length < 3) return false;
  // Masked account/card numbers: XX1234, XXXX5678, ****1234
  if (/^[Xx*]{1,6}\d{2,}$/.test(candidate)) return false;
  if (/^\d+$/.test(candidate)) return false;
  return !PAYEE_STOPWORDS.has(candidate.toLowerCase());
}

export function extractPayee(text: string): string | null {
  for (let i = 0; i < PAYEE_PATTERNS.length; i++) {
    const match = text.match(PAYEE_PATTERNS[i]);
    if (match?.[1]) {
      const payee = match[1].trim().replace(/\s+/g, ' ');
      if (!isValidPayeeCandidate(payee)) continue;
      const isParentheticalFallback = i === PAYEE_PATTERNS.length - 1;
      if (isParentheticalFallback) {
        const lower = payee.toLowerCase();
        if (PAYEE_BOILERPLATE_MARKERS.some(marker => lower.includes(marker))) continue;
        if (/\d/.test(payee)) continue; // reference numbers, phone numbers, amounts
      }
      return payee;
    }
  }
  return null;
}

export function parseTransactionText(text: string): ParsedTransaction {
  return {
    kind: classifyTransactionKind(text),
    amount: extractAmount(text),
    payee: extractPayee(text),
  };
}
