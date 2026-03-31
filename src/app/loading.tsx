"use client"

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#070710]">
      <div className="relative">
        {/* Pulsing Violet Ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-violet-500/50"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-violet-500/30"
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
        className="mt-12 text-xs font-black uppercase tracking-[0.4em] text-violet-400 font-mono"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        INITIALIZING MATRIX...
      </motion.p>
    </div>
  );
}
