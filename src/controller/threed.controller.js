import { threed } from "../models/threed.model.js";
import { Op } from "sequelize";

export const saveThreedTicket = async(req, res) =>{
    try {
        const {gameTime, loginId, ticketNumbers, range, totalQuantity, totalPoints} = req.body;

        if(!gameTime || !loginId || !ticketNumbers || !range || !totalQuantity || !totalPoints){
            return res.status(400).json({
                message : 'All the fields did not recieved to backend',
            })
        }

        const newThreed = await threed.create({
            gameTime, loginId, ticketNumbers, range, totalQuantity, totalPoints
        });

        return res.status(201).json({
            message : "Threed record created successfully",
            data : newThreed,
        })

    }catch(error) {
        console.error("Error saving threed", error);
        return res.status(500).json({message:"Internal Server Error"});
    }
}


// Helper: get YYYY-MM-DD only (ignore time)
function getDateRange(dateString) {
  const start = new Date(dateString);
  start.setHours(0, 0, 0, 0);

  const end = new Date(dateString);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export const getTicketsByDate = async (req, res) => {
  try {
    const { date } = req.body; // ✅ comes from body now
    if (!date) {
      return res.status(400).json({ message: "Date is required in body" });
    }

    const { start, end } = getDateRange(date);

    // fetch rows for the given date
    const rows = await threed.findAll({
      where: {
        createdAt: {
          [Op.between]: [start, end],
        },
      },
      raw: true,
    });

    // initialize result object
    const ranges = [10, 20, 50, 100, 200, 500];
    const result = {
      quantities: {},
      ticketAmount: {},
      ticketsByRange: {},
      typeSummary: {},
    };

    ranges.forEach((r) => {
      result.quantities[r] = 0;
      result.ticketAmount[r] = 0;
      result.ticketsByRange[r] = [];
    });

    // process each row
    rows.forEach((row) => {
      const { id, range, totalQuantity, totalPoints, ticketNumbers } = row;

      if (!ranges.includes(range)) return;

      result.quantities[range] += totalQuantity;
      result.ticketAmount[range] += parseInt(totalPoints, 10);

      // normalize ticketNumbers to array
      let tickets = [];
      if (typeof ticketNumbers === "string") {
        try {
          tickets = JSON.parse(ticketNumbers);
        } catch {
          tickets = [];
        }
      } else if (Array.isArray(ticketNumbers)) {
        tickets = ticketNumbers;
      } else if (ticketNumbers && typeof ticketNumbers === "object") {
        tickets = [ticketNumbers];
      }

      tickets.forEach((ticket) => {
        result.ticketsByRange[range].push({
          shopNumber: id,
          ticketNumber: ticket.number,
          type: ticket.type,
        });

        const t = ticket.type;
        if (!result.typeSummary[t]) result.typeSummary[t] = 0;
        result.typeSummary[t]++;
      });
    });

    return res.json(result);
  } catch (error) {
    console.error("Error fetching tickets by date:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
