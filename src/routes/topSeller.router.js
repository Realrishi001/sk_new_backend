// routes/topSellers.routes.js
import express from "express";
import { getTopSellersForNextDraw } from "../controller/topSeller.controller.js";

const router = express.Router();

// Route to get top sellers for the next draw
router.get("/top-sellers-next-draw", getTopSellersForNextDraw);

export default router;
