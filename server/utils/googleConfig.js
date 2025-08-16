import {google} from "googleapis";
import dotenv from "dotenv";

dotenv.config();


const GOOGLE_CLIENT_ID = process.env.CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.CLIENT_SECRET;

export const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/api/auth/google/callback"
);