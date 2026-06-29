import { Shield, Mail, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | UnicornApps",
  description: "Official privacy documentation and data protection policies for UnicornApps.",
};

export default function PrivacyPage() {
  const sections = [
    {
      id: "01",
      title: "Information We Collect",
      content: "We collect your email address for account management and authentication. When using the AI analysis features, we process the product images you upload to generate metadata, descriptions, and content. We do not store original raw images longer than necessary for processing."
    },
    {
      id: "02",
      title: "How We Use Information",
      content: "Collected data is primarily used to provide our core services. Gemini AI analyzes your images to create Amazon titles, Shopify descriptions, and social media hooks. Analytical data helps us refine our AI models and improve the user experience for global sellers."
    },
    {
      id: "03",
      title: "Data Storage",
      content: "Your data is stored securely using industry-standard encryption and cloud infrastructure. We implement temporary caching for faster processing, but our long-term storage is limited to essential account metadata and generated content history."
    },
    {
      id: "04",
      title: "Third-Party Services",
      content: "We utilize Google Gemini for image analysis and Supabase for authentication and database management. These third-party services are critical to our infrastructure and have their own privacy standards which we monitor for compliance."
    },
    {
      id: "05",
      title: "Data Sharing",
      content: "UnicornApps has a strict policy against selling user data to third parties. Your information is only shared with essential service providers (like payment processors or AI engines) as required to deliver our services, or when legally mandated by law enforcement."
    },
    {
      id: "06",
      title: "Security",
      content: "We implement reasonable technical and organizational measures to protect your information from unauthorized access, loss, or alteration. This includes SSL encryption, secure API communication, and regular security audits of our cloud providers."
    },
    {
      id: "07",
      title: "User Rights",
      content: "You have the right to access, update, or delete your personal information at any time. You can request a full account deletion, including all history and metadata, by contacting our support team or using the self-service dashboard tools."
    },
    {
      id: "08",
      title: "Contact",
      content: "If you have any questions or concerns regarding this Privacy Policy, please reach out to our legal and support team at support@unicornapps.app. We aim to respond to all privacy-related inquiries within 48 business hours."
    },
    {
      id: "09",
      title: "Updates",
      content: "This Privacy Policy may change as we introduce new features or respond to legal requirements. We will notify users of significant changes via the email address associated with their account or through a dashboard notification."
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
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">Legal Documentation</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4 uppercase">
             Privacy Policy
          </h1>
          <div className="flex flex-col md:flex-row md:items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
             <span>Version 1.2</span>
             <span className="hidden md:inline text-white/10">•</span>
             <span>Last Updated: April 1, 2026</span>
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
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Need a physical copy?</h3>
                <p className="text-xs text-slate-500 font-medium tracking-wide">For official records, you can print this document or contact support.</p>
             </div>
             
             <div className="flex gap-4">
                <Link href="mailto:support@unicornapps.app">
                   <Button size="sm" className="h-12 px-6 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-violet-600/20 group">
                      <Mail className="mr-2 h-3.5 w-3.5" />
                      Contact Legal
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
              <span className="text-[10px] font-black uppercase tracking-widest">UnicornApps Global</span>
           </div>
           <p className="text-[10px] font-black uppercase tracking-[0.2em]">Last Updated • 2026</p>
        </div>
      </div>
    </main>
  );
}
