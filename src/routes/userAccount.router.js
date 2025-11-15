import express from "express";
import { getClaimedTicketsByAdmin } from "../controller/userAccount.controller.js";

const router = express.Router();

router.post("/user-claimed-tickets", getClaimedTicketsByAdmin);

export default router;
