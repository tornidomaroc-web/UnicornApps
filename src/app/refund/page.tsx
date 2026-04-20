import { Shield, Mail, ArrowRight, FileText, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "Refund Policy | UnicornApps",
  description: "Official refund and cancellation policy for UnicornApps services.",
};

export default function RefundPage() {
  const sections = [
    {
      id: "01",
      title: "Overview",
      icon: <FileText className="w-4 h-4 text-violet-400" />,
      content: "At UnicornApps, we stand behind the quality of our AI-powered e-commerce tools. We want you to be completely satisfied with your purchase, and we've designed our refund policy to be as transparent and user-friendly as possible."
    },
    {
      id: "02",
      title: "Eligibility (14 Days)",
      icon: <CheckCircle2 className="w-4 h-4 text-violet-400" />,
      content: "We offer a full refund within 14 days of purchase, no questions asked. Whether you've used our services or not, if you are not satisfied within the first 14 days, you are eligible for a complete reimbursement of your payment."
    },
    {
      id: "03",
      title: "How to Request",
      icon: <Mail className="w-4 h-4 text-violet-400" />,
      content: "To request a refund, simply contact us at support@unicorn-apps.com. Please include the email address associated with your account and your order number to help us process your request quickly."
    },
    {
      id: "04",
      title: "Processing Time",
      icon: <Clock className="w-4 h-4 text-violet-400" />,
      content: "Once your refund request is received, it will be processed immediately. The funds will typically appear in your original payment method within 5-10 business days, depending on your bank or credit card provider."
    }
  ];

  return (
    <main className="min-h-screen bg-[#070710] text-[#c8cfe0] pt-40 pb-24 px-4 relative overflow-hidden">
      {/* 1. BACKGROUND EFFECTS - SUBTLE */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-violet-600/5 rounded-full blur-[160px]" />
        <div className="absolute inset-0 opacity-[0.02]" 
             style={{ backgroundImage: `linear-gradient(#c8cfe0 1px, transparent 1px), linear-gradient(90deg, #c8cfe0 1px, transparent 1px)`, backgroundSize: '80px 80px' }} 
        />
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        {/* 2. HEADER SECTION - OFFICIAL & COMPACT */}
        <div className="border-b border-white/5 pb-12 mb-16 text-center md:text-left">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center border border-violet-500/20">
               <Shield className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">Legal & Compliance</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4 uppercase">
             Refund Policy
          </h1>
          <div className="flex flex-col md:flex-row md:items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
             <span>Version 1.0</span>
             <span className="hidden md:inline text-white/10">•</span>
             <span>Effective Date: April 20, 2026</span>
          </div>
        </div>

        {/* 3. POLICY SECTIONS - SINGLE COLUMN READABILITY */}
        <div className="space-y-12 mb-24">
          {sections.map((section) => (
            <section key={section.id} className="relative group">
              <div className="flex gap-6 md:gap-10">
                 {/* Sidebar Numbering */}
                 <div className="hidden md:flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:border-violet-500/50 group-hover:text-violet-400 transition-all">
                       {section.id}
                    </div>
                    <div className="flex-1 w-px bg-white/5 my-4" />
                 </div>

                 {/* Content */}
                 <div className="flex-1 space-y-4">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                       <span className="md:hidden text-violet-500/50 text-xs">{section.id}.</span>
                       {section.title}
                    </h2>
                    <div className="p-8 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.05] transition-all">
                       <p className="text-slate-400 text-sm font-medium leading-relaxed">
                          {section.content}
                       </p>
                    </div>
                 </div>
              </div>
            </section>
          ))}
        </div>

        {/* 4. CONTACT & EXPORT FOOTER */}
        <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl -tr-16 -mt-16" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
             <div className="space-y-2 text-center md:text-left">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Need a refund?</h3>
                <p className="text-xs text-slate-500 font-medium tracking-wide">Contact our support team and we will handle your request immediately.</p>
             </div>
             
             <div className="flex gap-4">
                <Link href="mailto:support@unicorn-apps.com">
                   <Button size="sm" className="h-12 px-6 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-violet-600/20 group">
                      <Mail className="mr-2 h-3.5 w-3.5" />
                      Email Support
                      <ArrowRight className="ml-2 h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                   </Button>
                </Link>
             </div>
          </div>
        </div>

        {/* 5. OFFICIAL FOOTER */}
        <div className="mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 opacity-40">
           <div className="flex items-center gap-4">
              <div className="w-6 h-6 bg-white text-black text-[12px] font-black rounded flex items-center justify-center">U</div>
              <span className="text-[10px] font-black uppercase tracking-widest">UnicornApps Global Matrix</span>
           </div>
           <p className="text-[10px] font-black uppercase tracking-[0.2em]">Matrix Compliance Certified • 2026</p>
        </div>
      </div>
    </main>
  );
}
