"use client"

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 bg-transparent">
      <div className="relative">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-violet-500/50"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
        />
        
        <motion.div
           className="w-20 h-20 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(124,58,237,0.3)]"
           animate={{ rotate: 360 }}
           transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
        >
           <span className="text-4xl">🦄</span>
        </motion.div>
      </div>

      <motion.p
        className="mt-8 text-[10px] font-black uppercase tracking-[0.4em] text-violet-400 font-mono"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        LOADING YOUR ENGINE...
      </motion.p>
    </div>
  );
}
