import mongoose from 'mongoose';

/**
 * Completely clears all documents across all Mongoose collections
 * while preserving indexes for deterministic test execution.
 */
export const clearDatabase = async () => {
  if (mongoose.connection.readyState !== 1) return;

  const collections = mongoose.connection.collections;
  const clearPromises = Object.keys(collections).map(async (key) => {
    const collection = collections[key];
    try {
      await collection.deleteMany({});
    } catch (err) {
      // Ignore namespace or index errors during wiping
    }
  });

  await Promise.all(clearPromises);
};

export default {
  clearDatabase,
};
