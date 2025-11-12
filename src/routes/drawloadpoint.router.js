import express from 'express'
import { getTicketsBySeries, getTicketsBySeriesWithShop, getTicketSummary } from '../controller/drawloadpoint.controller.js';

const router = express.Router();

router.get("/draw-details", getTicketSummary);
router.post("/table-draw-details", getTicketsBySeries);
router.get("/tickets-by-admin", getTicketsBySeriesWithShop);

export default router;