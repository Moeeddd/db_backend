const express = require("express");
const router = express.Router();
const driverController = require("../controllers/driverController");
const { verifyToken } = require("../middleware/authMiddleware");
const { checkRole } = require("../middleware/roleMiddleware");

router.get("/my-bookings", verifyToken, checkRole(["Driver"]), driverController.myBookings);
router.post("/update-status", verifyToken, checkRole(["Driver"]), driverController.updateBookingStatus);

module.exports = router;