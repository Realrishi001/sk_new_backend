import express from 'express'
import { getActive3DTickets, cancel3DTicket, getCancelled3DTickets, restore3DTicket } from '../controller/3dcancelledticket.controller.js';

const router = express.Router();

router.post("/3d/show-tickets", getActive3DTickets);
router.post("/3d/cancel-ticket", cancel3DTicket);
router.post("/3d/cancelled-tickets", getCancelled3DTickets);
router.post("/3d/restore-ticket", restore3DTicket);


export default router;