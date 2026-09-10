import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function FinalCTASection() {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 text-center">
        <h2 className="text-3xl md:text-4xl font-heading font-semibold leading-tight">
          Start building stronger relationships today.
        </h2>
        <p className="mt-4 text-primary-foreground/80">
          Join BoriSend and never miss a moment that matters.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/register" className="w-full sm:w-auto">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto">
              Get Started
            </Button>
          </Link>
          <Link to="/login" className="w-full sm:w-auto">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              Log In
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}