import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 md:pt-28 md:pb-24 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-heading font-semibold leading-tight tracking-tight">
          Stay connected with the people who matter.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          BoriSend helps you remember important moments, create thoughtful messages, and deliver the messages for you.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/register" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto">
              Get Started <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/login" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">Log In</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}