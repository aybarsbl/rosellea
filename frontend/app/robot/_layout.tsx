import { HeaderBackButton } from "@react-navigation/elements";
import { Stack, useRouter } from "expo-router";

export default function RobotLayout() {
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
        name="[id]"
        options={{
          title: "Ayarlar",
          headerLeft: (props) => (
            <HeaderBackButton {...props} onPress={() => router.back()} />
          ),
        }}
      />
    </Stack>
  );
}
