import dotenv from "dotenv";
import express from "express";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json())