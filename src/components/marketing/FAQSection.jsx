import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    question: "What is BoriSend?",
    answer: "BoriSend is a communication planning tool. It helps you remember important moments, write thoughtful messages and send them at the right time — all in one place.",
  },
  {
    question: "How does BoriSend work?",
    answer: "You create a Communication Plan for the people you want to stay in touch with. BoriSend helps you write messages, schedules them based on your preferences, and sends them through your phone's messaging app after you approve them.",
  },
  {
    question: "Do I need to write my own messages?",
    answer: "You can write your own messages, or you can use the built-in writing assistance to help you find the right words. You always review and approve messages before they are sent.",
  },
  {
    question: "Can I control when messages are sent?",
    answer: "Yes. You choose the schedule for each Communication Plan — daily, weekly, on specific dates, or on selected weekdays. You can also choose between manual and automatic approval.",
  },
  {
    question: "Is my data safe?",
    answer: "BoriSend is built with security in mind. Your data is stored securely and is only accessible to you. We do not share your information with third parties.",
  },
  {
    question: "Can I cancel my subscription?",
    answer: "Yes. You can cancel your subscription at any time from your account settings. You will continue to have access until the end of your current billing period.",
  },
  {
    question: "Which devices does BoriSend work on?",
    answer: "BoriSend works on phones, tablets and computers. You can access it through your web browser, and it is also available as a mobile app for iOS and Android.",
  },
  {
    question: "What is the Referral Programme?",
    answer: "When you invite others to BoriSend, you can earn rewards. You will find your unique referral code in the Referrals section of your account.",
  },
];

export default function FAQSection() {
  return (
    <section id="faq" className="scroll-mt-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-heading font-semibold leading-tight">
            Frequently asked questions.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to know about BoriSend.
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {FAQS.map((faq, idx) => (
            <AccordionItem
              key={idx}
              value={`item-${idx}`}
              className="border border-border/50 rounded-2xl px-5 data-[state=open]:bg-card data-[state=open]:shadow-sm transition-all"
            >
              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}