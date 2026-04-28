const express = require("express");
const router  = express.Router();
const c = require("../controllers/customerController");
const { verifyToken } = require("../middleware/authMiddleware");
const { checkRole }   = require("../middleware/roleMiddleware");

const auth = [verifyToken, checkRole(["Customer"])];

router.get ("/available-vehicles",  ...auth, c.getAvailableVehicles);
router.get ("/available-drivers",   ...auth, c.getAvailableDrivers);
router.post("/book-vehicle",        ...auth, c.createBooking);
router.post("/purchase-vehicle",    ...auth, c.purchaseVehicle);
router.get ("/my-bookings",         ...auth, c.myBookingHistory);
router.get ("/my-purchases",        ...auth, c.myPurchases);

// Payment routes — no manual IDs, customer_id from JWT
router.post("/pay-booking",         ...auth, c.payForBooking);
router.post("/pay-purchase",        ...auth, c.payForPurchase);

module.exports = router;
