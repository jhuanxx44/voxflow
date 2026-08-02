import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.API_KEY;
const baseURL = process.env.LLM_BASE_URL || 'http://llmapi.bilibili.co/v1';

const client = new OpenAI({
  apiKey: apiKey,
  baseURL,
});

export const getAIClient = () => {
  if (!client.apiKey || client.apiKey === "undefined") {
    throw new Error("API Key is missing. Please set LLM_API_KEY in .env");
  }
  return client;
};
