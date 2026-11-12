import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const reviews = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reviews' }),
  schema: z.object({
    title: z.string(),
    locale: z.enum(['en', 'fr']).optional(),
    translationOf: z.string().optional(),
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
    score: z.number().min(0).max(10),
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
