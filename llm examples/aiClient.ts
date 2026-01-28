import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.API_KEY;

const client = new OpenAI({
  apiKey: apiKey,
  baseURL: 'http://llmapi.bilibili.co/v1',
});

export const getAIClient = () => {
  if (!client.apiKey || client.apiKey === "undefined") {
    throw new Error("API Key is missing. Please set BILI_LLM_API_KEY or GEMINI_API_KEY environment variables.");
  }
  return client;
};