import { useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, Image, ActivityIndicator,
  ScrollView, Alert, Animated, Easing
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '@/lib/supabase'

const MacroCard = ({ label, value, unit, color }: any) => (
  <View style={{
    flex: 1, alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
    borderWidth: 1, borderColor: '#2a2a2a', marginHorizontal: 4
  }}>
    <View style={{
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: color, marginBottom: 6
    }} />
    <Text style={{ color, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>
      {value}
    </Text>
    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 1 }}>{unit}</Text>
    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2, fontWeight: '600' }}>
      {label}
    </Text>
  </View>
)

export default function ScanScreen() {
  const router = useRouter()
  const [image, setImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const pulseAnim = useRef(new Animated.Value(1)).current

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }

  const stopPulse = () => {
    pulseAnim.stopAnimation()
    pulseAnim.setValue(1)
  }

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7,
    })
    if (!res.canceled && res.assets[0]) {
      setImage(res.assets[0].uri)
      analyzeFood(res.assets[0].base64!)
    }
  }

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
    if (!res.canceled && res.assets[0]) {
      setImage(res.assets[0].uri)
      analyzeFood(res.assets[0].base64!)
    }
  }

  const analyzeFood = async (base64: string) => {
    setLoading(true)
    setResult(null)
    startPulse()
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'image/jpeg', data: base64 } },
                { text: 'Analyze this food image. Respond with JSON only, no other text, no markdown: {"food_name": "name of the meal", "calories": number, "protein": number, "carbs": number, "fat": number, "confidence": "high" or "medium" or "low"}' },
              ]
            }]
          }),
        }
      )
      const data = await response.json()
      if (data.error) throw new Error('API Error: ' + data.error.message)
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON in response: ' + text)
      const parsed = JSON.parse(jsonMatch[0])
      setResult(parsed)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? JSON.stringify(e))
    }finally {
      setLoading(false)
      stopPulse()
    }
  }

  const saveLog = async () => {
    if (!result) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('food_logs').insert({
      user_id: user.id,
      food_name: result.food_name,
      calories: result.calories,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      ai_confidence: result.confidence,
    })
    Alert.alert('✅ Logged!', `${result.food_name} added to your diary.`)
    router.back()
  }

  const confidenceColor = result?.confidence === 'high' ? '#22c55e' : result?.confidence === 'medium' ? '#f59e0b' : '#ef4444'

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0d0d0d' }}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}>

      {/* Header */}
      <LinearGradient colors={['#0d0d0d', '#111']} style={{ paddingTop: 60, paddingHorizontal: 24, paddingBottom: 24 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 20 }}>
          <Text style={{ color: '#22c55e', fontSize: 16, fontWeight: '600' }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -1 }}>
          Snap Your Meal
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, marginTop: 4 }}>
          AI-powered nutrition in seconds
        </Text>
      </LinearGradient>

      <View style={{ paddingHorizontal: 24 }}>

        {/* Photo area */}
        {image ? (
          <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 20 }}>
            <Image source={{ uri: image }}
              style={{ width: '100%', height: 260, borderRadius: 24 }}
              resizeMode="cover" />
            {loading && (
              <View style={{
                ...StyleSheet_absolute,
                backgroundColor: 'rgba(0,0,0,0.65)',
                borderRadius: 24,
                justifyContent: 'center', alignItems: 'center'
              }}>
                <ActivityIndicator size="large" color="#22c55e" />
                <Text style={{ color: '#fff', marginTop: 12, fontSize: 15, fontWeight: '600' }}>
                  Analyzing meal...
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
                  Powered by Claude AI
                </Text>
              </View>
            )}
          </Animated.View>
        ) : (
          <View style={{
            height: 220, borderRadius: 24, borderWidth: 1.5,
            borderColor: '#2a2a2a', borderStyle: 'dashed',
            justifyContent: 'center', alignItems: 'center', marginBottom: 20,
            backgroundColor: '#111'
          }}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>🍽️</Text>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              Take or upload a food photo
            </Text>
          </View>
        )}

        {/* Buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <TouchableOpacity onPress={takePhoto} style={{ flex: 1 }}>
            <LinearGradient colors={['#22c55e', '#16a34a']}
              style={{ borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, marginBottom: 2 }}>📷</Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Camera</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} style={{ flex: 1 }}>
            <View style={{
              borderRadius: 16, paddingVertical: 16, alignItems: 'center',
              backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a'
            }}>
              <Text style={{ fontSize: 20, marginBottom: 2 }}>🖼️</Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Gallery</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Results */}
        {result && (
          <View style={{
            backgroundColor: '#111', borderRadius: 24,
            borderWidth: 1, borderColor: '#2a2a2a', overflow: 'hidden'
          }}>
            {/* Top strip */}
            <LinearGradient colors={['#0f2a18', '#0d0d0d']}
              style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', flex: 1, letterSpacing: -0.5 }}>
                  {result.food_name}
                </Text>
                <View style={{
                  backgroundColor: confidenceColor + '22',
                  borderWidth: 1, borderColor: confidenceColor + '55',
                  borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8
                }}>
                  <Text style={{ color: confidenceColor, fontSize: 11, fontWeight: '700' }}>
                    {result.confidence?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#22c55e', fontSize: 42, fontWeight: '900', marginTop: 8, letterSpacing: -2 }}>
                {result.calories}
                <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', fontWeight: '400' }}> kcal</Text>
              </Text>
            </LinearGradient>

            {/* Macros row */}
            <View style={{ flexDirection: 'row', padding: 16, gap: 0 }}>
              <MacroCard label="Protein" value={result.protein} unit="g" color="#60a5fa" />
              <MacroCard label="Carbs" value={result.carbs} unit="g" color="#f59e0b" />
              <MacroCard label="Fat" value={result.fat} unit="g" color="#f87171" />
            </View>

            {/* Save button */}
            <View style={{ padding: 16, paddingTop: 0 }}>
              <TouchableOpacity onPress={saveLog}>
                <LinearGradient colors={['#22c55e', '#16a34a']}
                  style={{ borderRadius: 16, paddingVertical: 18, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.3 }}>
                    Save to Diary
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setImage(null); setResult(null) }}
                style={{ alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Try another photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const StyleSheet_absolute = {
  position: 'absolute' as const,
  top: 0, left: 0, right: 0, bottom: 0,
}