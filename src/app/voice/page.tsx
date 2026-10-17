import { VoiceAssistant } from "@/components/voice/VoiceAssistant";

export const metadata = {
  title: "Voice Assistant · RasoiOS",
  description: "Speak or type kitchen updates to interpret structured inventory and meal proposals.",
};

export default function VoicePage() {
  return <VoiceAssistant />;
}
