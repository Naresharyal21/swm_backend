const RewardClaim = require('../models/RewardClaim');
const RewardRate = require('../models/RewardRate');
const WalletTransaction = require('../models/WalletTransaction');
const { notFound, badRequest } = require('../utils/errors');

async function approveClaim({ claimId, reviewerUserId, note = '' }) {
  const claim = await RewardClaim.findById(claimId);
  if (!claim) throw notFound('Reward claim not found');
  if (claim.status !== 'PENDING') throw badRequest('Claim already processed');

  const rate = await RewardRate.findOne({ category: claim.category, isActive: true }).lean();
  if (!rate) throw badRequest('No active rate for this category');

  const amount = rate.ratePerUnit * claim.quantity;
  claim.status = 'APPROVED';
  claim.reviewedByUserId = reviewerUserId;
  claim.reviewedAt = new Date();
  claim.amountCredit = amount;
  claim.note = note;
  await claim.save();

  await WalletTransaction.create({
    userId: claim.userId,
    type: 'CREDIT',
    amount,
    reason: `Reward credit: ${claim.category}`,
    refType: 'RewardClaim',
    refId: claim._id
  });

  return claim;
}

async function rejectClaim({ claimId, reviewerUserId, note = '' }) {
  const claim = await RewardClaim.findById(claimId);
  if (!claim) throw notFound('Reward claim not found');
  if (claim.status !== 'PENDING') throw badRequest('Claim already processed');
  claim.status = 'REJECTED';
  claim.reviewedByUserId = reviewerUserId;
  claim.reviewedAt = new Date();
  claim.note = note;
  await claim.save();
  return claim;
}

module.exports = { approveClaim, rejectClaim };
