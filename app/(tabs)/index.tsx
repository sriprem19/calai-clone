import { useState, useEffect, useRef } from 'react'
import {
  View, ScrollView, TouchableOpacity, Animated,
  RefreshControl, Dimensions, StatusBar
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import { Text } from '@/components/ui/Text'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import Svg, { Circle } from 'react-native-svg'

const { width: SCREEN_W } = Dimensions.get('window')

// ─── Types ────────────────────────────────────────────────────────────────────
interface FoodLog {
  id: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  logged_at: string
  meal_type: string
  ai_confidence?: string
}
interface Goals {
  calorie_goal: number
  protein_goal: number
  carbs_goal: number
  fat_goal: number
}

// ─── Animated Ring ────────────────────────────────────────────────────────────
function AnimatedRing({
  value, goal, color, label, size = 80, stroke = 7,
}: {
  value: number; goal: number; color: string; label: string; size?: number; stroke?: number
}) {
  const pct = Math.min(value / Math.max(goal, 1), 1)
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = pct * circ

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
          <Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            rotation={-90} origin={`${size/2}, ${size/2}`} />
        </Svg>
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: -0.3 }}>
            {value}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '600' }}>/ {goal}g</Text>
        </View>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

// ─── Calorie Arc ──────────────────────────────────────────────────────────────
function CalorieArc({ eaten, goal }: { eaten: number; goal: number }) {
  const size = SCREEN_W - 80
  const stroke = 10
  const r = (size - stroke) / 2
  const circ = Math.PI * r // half arc
  const pct = Math.min(eaten / Math.max(goal, 1), 1)
  const fill = pct * circ
  const remaining = Math.max(goal - eaten, 0)
  return (
    <View style={{ alignItems: 'center', marginTop: -10 }}>
      <Svg width={size} height={size / 2 + stroke} style={{ overflow: 'visible' }}>
        <Circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke} fill="none"
          strokeDasharray={`${circ} ${2 * Math.PI * r}`} strokeLinecap="round"
          rotation={180} origin={`${size/2}, ${size/2}`} />
        <Circle cx={size/2} cy={size/2} r={r}
          stroke={pct >= 1 ? '#f87171' : '#22c55e'}
          strokeWidth={stroke} fill="none"
          strokeDasharray={`${fill} ${2 * Math.PI * r}`} strokeLinecap="round"
          rotation={180} origin={`${size/2}, ${size/2}`} />
      </Svg>
      {/* Labels inside arc */}
      <View style={{ position: 'absolute', bottom: 0, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: -3 }}>
          {eaten}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '600', marginTop: -4 }}>
          of {goal} kcal
        </Text>
        <View style={{
          marginTop: 8, backgroundColor: remaining === 0 ? 'rgba(248,113,113,0.15)' : 'rgba(34,197,94,0.12)',
          borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6,
        }}>
          <Text style={{
            color: remaining === 0 ? '#f87171' : '#22c55e',
            fontSize: 13, fontWeight: '800',
          }}>
            {remaining === 0 ? '🎯 Goal reached!' : `${remaining} kcal remaining`}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Meal type label ──────────────────────────────────────────────────────────
function mealIcon(type: string) {
  const map: Record<string, string> = {
    breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
  }
  return map[type] ?? '🍽️'
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { data: profile } = useProfile()
  const [refreshing, setRefreshing] = useState(false)
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [goals, setGoals] = useState<Goals>({
    calorie_goal: 2000, protein_goal: 150, carbs_goal: 250, fat_goal: 65,
  })
  const [streak, setStreak] = useState(0)
  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }).start()
    fetchData()
  }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]

    const [logsRes, goalsRes, streakRes] = await Promise.all([
      supabase.from('food_logs').select('*')
        .eq('user_id', user.id)
        .gte('logged_at', today + 'T00:00:00')
        .order('logged_at', { ascending: false }),
      supabase.from('daily_goals').select('*').eq('user_id', user.id).single(),
      supabase.from('streaks').select('*').eq('user_id', user.id).single(),
    ])

    if (logsRes.data) setLogs(logsRes.data)
    if (goalsRes.data) setGoals(goalsRes.data)
    if (streakRes.data) setStreak(streakRes.data.current_streak ?? 0)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    queryClient.invalidateQueries()
    setRefreshing(false)
  }

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + (l.calories ?? 0),
      protein: acc.protein + (l.protein ?? 0),
      carbs: acc.carbs + (l.carbs ?? 0),
      fat: acc.fat + (l.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

const firstName = profile?.fullName?.split(' ')[0] ?? 'there'

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d0d' }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />}
      >
        {/* ── Header ── */}
        <LinearGradient
          colors={['#0a160d', '#0d0d0d']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 8 }}
        >
          <Animated.View style={{ opacity: fadeIn }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' }}>
                  {greeting}
                </Text>
                <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.8, marginTop: 2 }}>
                  {firstName} 👋
                </Text>
              </View>
              {/* Streak badge */}
              {streak > 0 && (
                <View style={{
                  backgroundColor: 'rgba(251,146,60,0.15)',
                  borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)',
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}>
                  <Text style={{ fontSize: 18 }}>🔥</Text>
                  <View>
                    <Text style={{ color: '#fb923c', fontSize: 18, fontWeight: '900', lineHeight: 20 }}>
                      {streak}
                    </Text>
                    <Text style={{ color: 'rgba(251,146,60,0.6)', fontSize: 9, fontWeight: '700' }}>
                      DAY STREAK
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </Animated.View>
        </LinearGradient>

        {/* ── Calorie Arc ── */}
        <Animated.View style={{ opacity: fadeIn, paddingTop: 16, paddingHorizontal: 40 }}>
          <CalorieArc eaten={Math.round(totals.calories)} goal={goals.calorie_goal} />
        </Animated.View>

        {/* ── Macro Rings ── */}
        <Animated.View style={{
          opacity: fadeIn,
          flexDirection: 'row', justifyContent: 'space-around',
          marginHorizontal: 24, marginTop: 28,
          backgroundColor: '#111', borderRadius: 24,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
          paddingVertical: 24, paddingHorizontal: 12,
        }}>
          <AnimatedRing value={Math.round(totals.protein)} goal={goals.protein_goal} color="#60a5fa" label="Protein" />
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8 }} />
          <AnimatedRing value={Math.round(totals.carbs)} goal={goals.carbs_goal} color="#fbbf24" label="Carbs" />
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8 }} />
          <AnimatedRing value={Math.round(totals.fat)} goal={goals.fat_goal} color="#f87171" label="Fat" />
        </Animated.View>

        {/* ── Big Scan CTA ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <TouchableOpacity
            onPress={() => router.push('/scan' as any)}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#16a34a', '#22c55e', '#4ade80']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 24, paddingVertical: 22,
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 12,
                shadowColor: '#22c55e', shadowOpacity: 0.35,
                shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
                elevation: 12,
              }}
            >
              <Text style={{ fontSize: 28 }}>📷</Text>
              <View>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 }}>
                  Log a Meal
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' }}>
                  Snap photo · AI counts calories
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Today's Diary ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 28 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.4 }}>
              Today's Diary
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '600' }}>
              {logs.length} {logs.length === 1 ? 'meal' : 'meals'}
            </Text>
          </View>

          {logs.length === 0 ? (
            <View style={{
              backgroundColor: '#111', borderRadius: 20,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
              paddingVertical: 40, alignItems: 'center', gap: 8,
            }}>
              <Text style={{ fontSize: 36 }}>🍽️</Text>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: '600' }}>
                No meals logged yet
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>
                Tap "Log a Meal" to get started
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {logs.map((log, i) => (
                <Animated.View
                  key={log.id}
                  style={{
                    opacity: fadeIn,
                    backgroundColor: '#111',
                    borderRadius: 18,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                    padding: 16, flexDirection: 'row',
                    alignItems: 'center', gap: 14,
                  }}
                >
                  {/* Icon */}
                  <View style={{
                    width: 48, height: 48, borderRadius: 14,
                    backgroundColor: 'rgba(34,197,94,0.1)',
                    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 22 }}>{mealIcon(log.meal_type)}</Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 }} numberOfLines={1}>
                      {log.food_name}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600' }}>
                        P {log.protein}g
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600' }}>
                        C {log.carbs}g
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600' }}>
                        F {log.fat}g
                      </Text>
                    </View>
                  </View>

                  {/* Calories */}
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#22c55e', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 }}>
                      {log.calories}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: '600' }}>
                      kcal
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          )}
        </View>

        {/* ── Quick Stats ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.4, marginBottom: 14 }}>
            Quick Stats
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[
              { label: 'Meals Today', value: logs.length.toString(), icon: '🍽️' },
              { label: 'Avg / Meal', value: logs.length ? Math.round(totals.calories / logs.length) + '' : '—', icon: '📊' },
            ].map(stat => (
              <View key={stat.label} style={{
                flex: 1, backgroundColor: '#111', borderRadius: 18,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                padding: 18, alignItems: 'center', gap: 6,
              }}>
                <Text style={{ fontSize: 24 }}>{stat.icon}</Text>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -1 }}>
                  {stat.value}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600' }}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  )
}