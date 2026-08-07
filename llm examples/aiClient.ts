import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.LLM_API_KEY;
const baseURL = process.env.LLM_BASE_URL;

const client = new OpenAI({
  apiKey: apiKey,
  baseURL,
});

export const getAIClient = () => {
  if (!client.apiKey || client.apiKey === "undefined") {
    throw new Error("API Key is missing. Please set LLM_API_KEY in .env");
  }
  if (!baseURL) {
    throw new Error("Provider URL is missing. Please set LLM_BASE_URL in .env");
  }
  return client;
};
