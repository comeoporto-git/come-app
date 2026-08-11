import { SocialAiChat } from "@/components/social/SocialAiChat";

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SocialAiChat />
    </>
  );
}
