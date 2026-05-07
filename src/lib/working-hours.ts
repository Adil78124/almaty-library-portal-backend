import { z } from "zod"

const timeHHmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ожидается время ЧЧ:ММ")

const dayScheduleSchema = z.discriminatedUnion("isOpen", [
  z.object({ isOpen: z.literal(false) }),
  z.object({
    isOpen: z.literal(true),
    from: timeHHmm,
    to: timeHHmm,
  }),
])

export const workingHoursSchema = z.object({
  monday: dayScheduleSchema,
  tuesday: dayScheduleSchema,
  wednesday: dayScheduleSchema,
  thursday: dayScheduleSchema,
  friday: dayScheduleSchema,
  saturday: dayScheduleSchema,
  sunday: dayScheduleSchema,
})
