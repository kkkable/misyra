import { z } from 'zod';

export const plannerExtractionInputSchema = z.any();
export const plannerExtractionGatewayRequestSchema = z.any();
export const plannerExtractionProviderOutputSchema = z.any();
export const plannerExtractionResultSchema = z.any();

export type PlannerExtractionInput = z.infer<typeof plannerExtractionInputSchema>;
export type PlannerExtractionGatewayRequest = z.infer<typeof plannerExtractionGatewayRequestSchema>;
export type PlannerExtractionProviderOutput = z.infer<typeof plannerExtractionProviderOutputSchema>;
export type PlannerExtractionResult = z.infer<typeof plannerExtractionResultSchema>;
