import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { ErpShell } from "@/components/ErpShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askAssistant } from "@/lib/assistant.functions";

type Message = { role: "user" | "assistant"; text: string };

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "ERP Assistant — Focus Lady Bra ERP" },
      { name: "description", content: "Ask questions about Focus Lady Bra ERP data." },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "I can help with sales, outstanding dues, purchases, expenses, stock, products, and customers.",
    },
  ]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", text }]);
    setBusy(true);
    try {
      const result = await askAssistant({ data: { question: text } });
      setMessages((current) => [...current, { role: "assistant", text: result.answer }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: error instanceof Error ? error.message : "The assistant could not respond." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ErpShell activeSlug="assistant" title="ERP Assistant" subtitle="Ask questions about your live ERP data">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5" /> Focus Lady assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="min-h-80 space-y-4 rounded-md bg-muted/30 p-4">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={message.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[85%]"}
                >
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {message.role === "user" ? "You" : "Assistant"}
                  </div>
                  <div
                    className={
                      message.role === "user"
                        ? "rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "rounded-md border border-border bg-card px-3 py-2 text-sm"
                    }
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {busy ? <div className="text-sm text-muted-foreground">Checking ERP data...</div> : null}
            </div>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask: What are our outstanding dues?"
                rows={2}
                maxLength={500}
                disabled={busy}
                className="min-h-11 resize-none"
              />
              <Button type="submit" className="sm:self-end" disabled={busy || !question.trim()}>
                <Send className="mr-2 h-4 w-4" /> Ask
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ErpShell>
  );
}
