from traffic_env import VectorizedTrafficEnv

env = VectorizedTrafficEnv("sambalpur_signals_15.json", n_envs=4)
obs = env.reset()

# Make all agents hold phase in all envs
actions = {
    env_idx: {sid: 0 for sid in env.signal_ids}
    for env_idx in range(env.n_envs)
}

for t in range(10):
    obs, rew, done, info = env.step(actions)
    print("Step", t, "reward S1 in env0:", rew[0]["S1"])
