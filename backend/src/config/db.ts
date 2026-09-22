import mongoose from 'mongoose';

export const connectDB = async (uri: string): Promise<void> => {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
  });
  console.log('MongoDB connected successfully');
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
};
