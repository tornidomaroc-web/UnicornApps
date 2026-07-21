"use client"

import { motion } from "framer-motion";

// z-40, NOT z-[100]: this overlay is opaque and inset-0, so at z-[100] it painted
// OVER the navbar (z-50) and a stalled route left the user with no navigation at
// all — the only true strand-point in the app. Lowering the OVERLAY is the correct
// fix; raising the navbar is not, because the dashboard camera modal
// (DashboardClient.tsx, z-[100]) must keep covering the nav. Nothing sits between
// z-40 and z-50, and page content is z-0/z-10, so the overlay still masks the page
// exactly as before.
export default function Loading() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#070710]">
      <div className="relative">
        {/* Pulsing brand ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-brand/50"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-brand/30"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "easeOut" }}
        />
        
        {/* Animated Unicorn Emoji */}
        <motion.div
          className="text-6xl relative z-10"
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          🦄
        </motion.div>
      </div>

      <motion.p
        className="mt-12 text-xs font-black uppercase tracking-[0.4em] text-brand font-mono"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        INITIALIZING MATRIX...
      </motion.p>
    </div>
  );
}
