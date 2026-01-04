import { getPrinted3DTickets, getPrintedTickets, savePrintedTickets, subtractAdminBalance } from "../controller/printedTickets.controller.js";
import express from "express"

const router = express.Router();

router.post("/saveTicket", savePrintedTickets);
router.post("/reprint-tickets", getPrintedTickets);
router.post("/subtract-balance", subtractAdminBalance);
router.post("/3d/printed-tickets", getPrinted3DTickets)

export default router;
