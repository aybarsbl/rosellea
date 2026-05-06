import { HeaderBackButton } from "@react-navigation/elements";
import { Stack, useRouter } from "expo-router";

export default function AddLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: "#020617" },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Yakındaki Cihazlar",
          headerLeft: (props) => (
            <HeaderBackButton {...props} onPress={() => router.back()} />
          ),
        }}
      />
      <Stack.Screen name="setup" options={{ title: "Robot Kurulumu" }} />
    </Stack>
  );
}
