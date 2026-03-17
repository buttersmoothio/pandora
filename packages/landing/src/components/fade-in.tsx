"use client"

import { type HTMLMotionProps, motion } from "motion/react"

interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number
  y?: number
}

export function FadeIn({
  children,
  delay = 0,
  y = 20,
  ...props
}: FadeInProps): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        y: {
          type: "spring",
          stiffness: 80,
          damping: 20,
          delay,
        },
        opacity: {
          duration: 0.6,
          delay,
          ease: "easeOut",
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}
