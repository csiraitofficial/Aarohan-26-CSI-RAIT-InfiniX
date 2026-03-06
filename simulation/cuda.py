import torch

print("CUDA Available:", torch.cuda.is_available())
print("Current Device:", torch.cuda.current_device())
print("Device Name:", torch.cuda.get_device_name(0))
print("Torch Version:", torch.__version__)

x = torch.rand(1000, 1000).to("cuda")
y = torch.matmul(x, x)
print("Computation OK:", y.sum().item())