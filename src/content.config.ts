import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const reviews = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reviews' }),
  schema: z.object({
    title: z.string(),
    originalTitle: z.string().optional(),
    headline: z.string(),
    hook: z.string().optional(),
    summary: z.string(),
    verdict: z.string().optional(),
    reviewVersion: z.number().optional(),
    type: z.enum(['game', 'movie', 'series']),
    date: z.coerce.date(),
    releaseDate: z.string().optional(),
    poster: z.string().optional(),
    backdrop: z.string().optional(),
    youtubeVideoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
    youtubeVideoTitle: z.string().optional(),
    score: z.number().gt(0).max(10),
    reviewMode: z.enum(['review', 'preview']).default('review'),
    sourceName: z.string().optional(),
    sourceVoteCount: z.number().int().nonnegative().optional(),
    sourceRatingScale: z.number().positive().optional(),
    metacriticScore: z.number().nonnegative().optional(),
    cast: z.array(z.string()).default([]),
    crew: z.array(z.string()).default([]),
    watchProviders: z.array(z.string()).default([]),
    watchProviderUrl: z.url().optional(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    tags: z.array(z.string()).default([]),
    genres: z.array(z.string()).default([]),
    creator: z.string().optional(),
    audience: z.string().optional(),
    sourceRating: z.number().optional(),
    sourceId: z.string(),
    sourceUrl: z.string().optional(),
    aiGenerated: z.boolean().default(true),
  }),
});
export const collections = { reviews };
