import { Queue, Worker } from "bullmq";
import { getRedis, ensureRedisReady } from "../config/redis.js";
import { logger } from "../config/logger.js";
import { processSeoTick } from "../modules/seoGrowth/seoGrowth.service.js";
import {
  SeoSetting,
  SeoKeyword,
  SeoJob,
  SeoContent,
  SeoKnowledge,
  SeoDay,
  SeoSnapshot,
} from "../modules/seoGrowth/seoGrowth.models.js";

export async function startSeoGrowthWorker() {
  // Additive index creation is required for production idempotency even with autoIndex disabled.
  for (const Model of [
    SeoSetting,
    SeoKeyword,
    SeoJob,
    SeoContent,
    SeoKnowledge,
    SeoDay,
    SeoSnapshot,
  ]) {
    try {
      await Model.createIndexes();
    } catch (err) {
      // Existing duplicate rows can block a unique index build; keep the worker up so
      // queued jobs still process, and surface the conflict for an operator cleanup.
      logger.error(
        { err, model: Model.modelName },
        "SEO index create failed; continuing without new indexes for this model",
      );
    }
  }
  let active = null;
  const tick = () => {
    if (active) return active;
    active = processSeoTick()
      .catch(() =>
        logger.error(
          "SEO scheduler pass failed; inspect job history and provider status",
        ),
      )
      .finally(() => {
        active = null;
      });
    return active;
  };
  if (!(await ensureRedisReady())) {
    // Mongo jobs/leases remain durable. This timer belongs to the persistent worker,
    // never to an API request or an open assistant session.
    const timer = setInterval(tick, 60000);
    timer.unref?.();
    void tick();
    return {
      close: async () => {
        clearInterval(timer);
        if (active) await active;
      },
    };
  }
  const connection = getRedis();
  const queue = new Queue("seo-growth", { connection });
  await queue.add(
    "tick",
    {},
    {
      repeat: { every: 60000 },
      jobId: "seo-growth-tick",
      removeOnComplete: 20,
      removeOnFail: 20,
    },
  );
  const worker = new Worker("seo-growth", tick, { connection, concurrency: 1 });
  worker.on("error", () => logger.error("SEO queue connection error"));
  worker.on("failed", () => logger.error("SEO queue tick failed"));
  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
