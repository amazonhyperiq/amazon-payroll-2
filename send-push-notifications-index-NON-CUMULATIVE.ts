import { createClient } from "npm:@supabase/supabase-js@2";

import webpush from "npm:web-push@3.6.7";



const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;



const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;



const VAPID_SUBJECT = "mailto:hypermarketamazon@gmail.com";



const supabase = createClient(

  SUPABASE_URL,

  SUPABASE_SERVICE_ROLE_KEY,

);



webpush.setVapidDetails(

  VAPID_SUBJECT,

  VAPID_PUBLIC_KEY,

  VAPID_PRIVATE_KEY,

);



const corsHeaders = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":

    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods": "POST, OPTIONS",

};



const MAX_ATTEMPTS = 5;

const STALE_LOCK_MINUTES = 10;



function getStatusCode(error: unknown): number {

  if (

    typeof error === "object" &&

    error !== null &&

    "statusCode" in error

  ) {

    const value = Number(

      (error as { statusCode?: number }).statusCode,

    );



    return Number.isFinite(value) ? value : 0;

  }



  return 0;

}



function getErrorMessage(error: unknown): string {

  if (error instanceof Error) {

    return error.message;

  }



  if (

    typeof error === "object" &&

    error !== null &&

    "message" in error

  ) {

    return String(

      (error as { message?: unknown }).message,

    );

  }



  return String(error);

}



Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {

    return new Response("ok", {

      headers: corsHeaders,

    });

  }



  try {

    /*

     * ---------------------------------------------------------

     * 1) إعادة فتح عمليات الإرسال التي علقت لفترة طويلة

     * ---------------------------------------------------------

     */



    const staleTime = new Date(

      Date.now() - STALE_LOCK_MINUTES * 60 * 1000,

    ).toISOString();



    const { error: staleError } = await supabase

      .from("advance_push_deliveries")

      .update({

        status: "pending",

        locked_at: null,

        next_attempt_at: new Date().toISOString(),

      })

      .eq("status", "sending")

      .lt("locked_at", staleTime);



    if (staleError) {

      throw staleError;

    }



    /*
     * ---------------------------------------------------------
     * 2) تحديد الحدث المطلوب إرساله
     * ---------------------------------------------------------
     * يجب أن يرسل الموقع event_id الخاص بالعملية الحالية.
     * هذا يمنع إرسال إشعارات قديمة متراكمة مع الإشعار الجديد.
     */

    let eventId: number | null = null;

    if (req.method === "POST") {
      let requestBody: { event_id?: unknown } = {};

      try {
        requestBody = await req.json();
      } catch {
        requestBody = {};
      }

      const parsedEventId = Number(requestBody.event_id);

      if (Number.isInteger(parsedEventId) && parsedEventId > 0) {
        eventId = parsedEventId;
      }
    }

    if (!eventId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "event_id مطلوب لإرسال الإشعار الحالي فقط",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    /*
     * ---------------------------------------------------------
     * 3) جلب الحدث المطلوب فقط
     * ---------------------------------------------------------
     */




    const { data: events, error: eventsError } = await supabase
      .from("advance_push_events")
      .select("id,event_type,title,body,created_at")
      .eq("id", eventId)
      .limit(1);



    if (eventsError) {

      throw eventsError;

    }



    if (!events || events.length === 0) {

      return new Response(

        JSON.stringify({

          success: true,

          message: "لا توجد إشعارات بانتظار الإرسال",

          events: 0,

          sent: 0,

          failed: 0,

          removed: 0,

        }),

        {

          headers: {

            ...corsHeaders,

            "Content-Type": "application/json",

          },

        },

      );

    }



    /*

     * ---------------------------------------------------------

     * 3) جلب الأجهزة النشطة

     * ---------------------------------------------------------

     */



    const {

      data: subscriptions,

      error: subscriptionsError,

    } = await supabase

      .from("advance_push_subscriptions")

      .select(

        "id,endpoint,p256dh,auth,role,display_name,is_active",

      )

      .eq("is_active", true);



    if (subscriptionsError) {

      throw subscriptionsError;

    }



    if (!subscriptions || subscriptions.length === 0) {

      return new Response(

        JSON.stringify({

          success: true,

          message: "لا توجد أجهزة مسجلة للإشعارات",

          events: events.length,

          devices: 0,

          sent: 0,

          failed: 0,

          removed: 0,

        }),

        {

          headers: {

            ...corsHeaders,

            "Content-Type": "application/json",

          },

        },

      );

    }



    let sent = 0;

    let failed = 0;

    let removed = 0;

    let skipped = 0;



    const failureDetails: unknown[] = [];



    /*

     * ---------------------------------------------------------

     * 4) معالجة كل حدث

     * ---------------------------------------------------------

     */



    for (const event of events) {

      /*

       * إنشاء سجل مستقل لكل:

       *

       * event + device

       *

       * UNIQUE(event_id, subscription_id)

       *

       * إذا كان السجل موجودًا، لا يتم إنشاء سجل جديد.

       */



      const deliveryRows = subscriptions.map((sub) => ({

        event_id: event.id,

        subscription_id: sub.id,

        status: "pending",

        attempts: 0,

        next_attempt_at: new Date().toISOString(),

      }));



      if (deliveryRows.length > 0) {

        const {

          error: deliveryInsertError,

        } = await supabase

          .from("advance_push_deliveries")

          .upsert(deliveryRows, {

            onConflict: "event_id,subscription_id",

            ignoreDuplicates: true,

          });



        if (deliveryInsertError) {

          throw deliveryInsertError;

        }

      }



      /*

       * -------------------------------------------------------

       * معالجة كل جهاز بشكل مستقل

       * -------------------------------------------------------

       */



      const payload = JSON.stringify({

        title: event.title,

        body: event.body,

        event_type: event.event_type,

        event_id: event.id,

        url: "/",

      });



      for (const sub of subscriptions) {

        /*

         * محاولة أخذ Lock للصف.

         *

         * فقط صف بحالة pending يمكن أخذه.

         *

         * إذا كان Function آخر قد أخذه بالفعل،

         * لن نحاول إرسال الإشعار مرة ثانية.

         */



        const {

          data: claimedRows,

          error: claimError,

        } = await supabase

          .from("advance_push_deliveries")

          .update({

            status: "sending",

            locked_at: new Date().toISOString(),

          })

          .eq("event_id", event.id)

          .eq("subscription_id", sub.id)

          .eq("status", "pending")

          .lte(

            "next_attempt_at",

            new Date().toISOString(),

          )

          .select("id,attempts");



        if (claimError) {

          console.error(

            "Failed to claim delivery:",

            claimError,

          );



          failed++;

          continue;

        }



        /*

         * لا يوجد صف = إما أنه أُرسل سابقًا،

         * أو Function آخر يعالجه الآن،

         * أو أنه ينتظر موعد المحاولة القادمة.

         */



        if (!claimedRows || claimedRows.length === 0) {

          skipped++;

          continue;

        }



        const delivery = claimedRows[0];



        try {

          /*

           * إرسال Web Push

           */



          await webpush.sendNotification(

            {

              endpoint: sub.endpoint,

              keys: {

                p256dh: sub.p256dh,

                auth: sub.auth,

              },

            },

            payload,

          );



          /*

           * الإرسال نجح.

           *

           * نسجل sent قبل أن نعتبر الجهاز مكتملًا.

           */



          const {

            error: sentError,

          } = await supabase

            .from("advance_push_deliveries")

            .update({

              status: "sent",

              sent_at: new Date().toISOString(),

              locked_at: null,

              last_error: null,

              attempts: delivery.attempts + 1,

            })

            .eq("id", delivery.id)

            .eq("status", "sending");



          if (sentError) {

            console.error(

              "Failed to mark delivery as sent:",

              sentError,

            );



            failed++;

            continue;

          }



          sent++;

        } catch (error) {

          failed++;



          const statusCode = getStatusCode(error);

          const errorBody =

  typeof error === "object" &&

  error !== null &&

  "body" in error

    ? String((error as { body?: unknown }).body ?? "")

    : "";



const errorMessage =

  getErrorMessage(error) +

  (errorBody ? \` | BODY: ${errorBody}\` : "");

          const nextAttempt = new Date(

            Date.now() + 60 * 1000,

          ).toISOString();



          /*

           * 404 / 410 =

           * endpoint لم يعد صالحًا.

           */



          if (statusCode === 404 || statusCode === 410) {

            const {

              error: deadError,

            } = await supabase

              .from("advance_push_deliveries")

              .update({

                status: "dead",

                locked_at: null,

                last_error: errorMessage,

                attempts: delivery.attempts + 1,

              })

              .eq("id", delivery.id)

              .eq("status", "sending");



            if (deadError) {

              console.error(

                "Failed to mark delivery as dead:",

                deadError,

              );

            }



            const {

              error: deactivateError,

            } = await supabase

              .from("advance_push_subscriptions")

              .update({

                is_active: false,

              })

              .eq("id", sub.id);



            if (deactivateError) {

              console.error(

                "Failed to deactivate subscription:",

                deactivateError,

              );

            } else {

              removed++;

            }

          } else {

            /*

             * خطأ مؤقت.

             *

             * نعيد الحالة إلى pending.

             *

             * بعد MAX_ATTEMPTS يتم تحويله إلى dead

             * حتى لا يبقى الحدث عالقًا إلى الأبد.

             */



            const newAttempts = delivery.attempts + 1;



            const newStatus =

              newAttempts >= MAX_ATTEMPTS

                ? "dead"

                : "pending";



            const {

              error: retryError,

            } = await supabase

              .from("advance_push_deliveries")

              .update({

                status: newStatus,

                locked_at: null,

                last_error: errorMessage,

                attempts: newAttempts,

                next_attempt_at: nextAttempt,

              })

              .eq("id", delivery.id)

              .eq("status", "sending");



            if (retryError) {

              console.error(

                "Failed to update failed delivery:",

                retryError,

              );

            }

          }



          if (failureDetails.length < 10) {

            failureDetails.push({

              event_id: event.id,

              device_id: sub.id,

              display_name: sub.display_name,

              statusCode,

              attempts: delivery.attempts + 1,

              message: errorMessage,

            });

          }



          console.error(

            "Push notification failed:",

            {

              event_id: event.id,

              device_id: sub.id,

              display_name: sub.display_name,

              statusCode,

              message: errorMessage,

            },

          );

        }

      }



      /*

       * -------------------------------------------------------

       * 5) هل انتهى هذا الحدث بالكامل؟

       *

       * sent  = تم الإرسال

       * dead  = لا يمكن الإرسال

       *

       * pending/sending = ما زال يحتاج معالجة

       * -------------------------------------------------------

       */



      const {

        data: remainingDeliveries,

        error: remainingError,

      } = await supabase

        .from("advance_push_deliveries")

        .select("id,status")

        .eq("event_id", event.id)

        .in("status", ["pending", "sending"]);



      if (remainingError) {

        console.error(

          "Failed to check remaining deliveries:",

          remainingError,

        );



        continue;

      }



      /*

       * إذا لم يبق pending أو sending،

       * يمكن حذف الحدث من queue.

       */



      if (

        !remainingDeliveries ||

        remainingDeliveries.length === 0

      ) {

        const {

          error: deleteError,

        } = await supabase

          .from("advance_push_events")

          .delete()

          .eq("id", event.id);



        if (deleteError) {

          console.error(

            "Failed to delete processed event:",

            deleteError,

          );

        }

      }

    }



    /*

     * ---------------------------------------------------------

     * النتيجة

     * ---------------------------------------------------------

     */



    return new Response(

      JSON.stringify({

        success: true,

        events_processed: events.length,

        devices: subscriptions.length,

        sent,

        failed,

        skipped,

        removed,

        failure_details: failureDetails,

      }),

      {

        headers: {

          ...corsHeaders,

          "Content-Type": "application/json",

        },

      },

    );

  } catch (error) {

    console.error(

      "send-push-notifications error:",

      error,

    );



    return new Response(

      JSON.stringify({

        success: false,

        error: getErrorMessage(error),

      }),

      {

        status: 500,

        headers: {

          ...corsHeaders,

          "Content-Type": "application/json",

        },

      },

    );

  }

});