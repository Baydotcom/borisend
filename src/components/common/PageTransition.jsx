import React from "react";
import { motion } from "framer-motion";

/**
 * Subtle page transition wrapper.
 * Fades + slides up on route change. No exit animation
 * to keep transitions fast and avoid layout shift.
 */
export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}