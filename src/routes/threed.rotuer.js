import express from 'express'
import { getTicketsByDate, saveThreedTicket } from '../controller/threed.controller.js';

const router = express.Router();

router.post("/save-threed", saveThreedTicket);
router.post("/search-threed", getTicketsByDate);

export default router;