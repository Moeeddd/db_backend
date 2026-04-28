const express = require("express");
const router  = express.Router();
const c = require("../controllers/adminController");
const { verifyToken } = require("../middleware/authMiddleware");
const { checkRole }   = require("../middleware/roleMiddleware");

const auth = [verifyToken, checkRole(["Admin"])];

// Vehicles
router.post  ("/add-vehicle",              ...auth, c.addVehicle);
router.delete("/remove-vehicle/:vehicle_id",...auth, c.removeVehicle);
router.get   ("/all-vehicles",             ...auth, c.getAllVehicles);

// Drivers
router.post  ("/add-driver",               ...auth, c.addDriver);
router.delete("/remove-driver/:driver_id", ...auth, c.removeDriver);
router.get   ("/all-drivers",              ...auth, c.getAllDrivers);

// Bookings — confirm only allowed after payment
router.post  ("/confirm-booking",          ...auth, c.confirmBooking);
router.get   ("/active-bookings",          ...auth, c.viewActiveBookings);

// Purchases
router.post  ("/set-purchase-price",       ...auth, c.setPurchasePrice);   // NEW — admin sets price first
router.post  ("/complete-purchase",        ...auth, c.completePurchase);   // then finalizes after payment
router.get   ("/pending-purchases",        ...auth, c.getPendingPurchases);

// Reports
router.get   ("/insurance-status",         ...auth, c.viewInsuranceStatus);
router.get   ("/payment-summary",          ...auth, c.viewPaymentSummary);
router.get   ("/payment-history",          ...auth, c.viewPaymentHistory);
router.get   ("/sold-vehicles",            ...auth, c.viewSoldVehicles);
router.get   ("/all-customers",            ...auth, c.getAllCustomers);

module.exports = router;
