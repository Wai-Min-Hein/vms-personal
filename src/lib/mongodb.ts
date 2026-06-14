import mongoose from "mongoose";
import { env } from "@/lib/env";

interface MongooseCache {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as unknown as {
  mongooseCache?: MongooseCache;
};

const cache = globalForMongoose.mongooseCache ?? {
  connection: null,
  promise: null
};

globalForMongoose.mongooseCache = cache;

export async function connectMongo() {
  if (cache.connection) return cache.connection;
  if (!cache.promise) {
    cache.promise = mongoose.connect(env.MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5_000
    });
  }
  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
}

export async function disconnectMongo() {
  cache.connection = null;
  cache.promise = null;
  await mongoose.disconnect();
}
