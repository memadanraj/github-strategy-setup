CREATE POLICY "Users read own paddle customer" ON public.paddle_customers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users read own paddle subscription" ON public.paddle_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own paddle subscription" ON public.paddle_subscriptions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Authenticated read credit packs" ON public.credit_packs FOR SELECT TO authenticated USING (true);