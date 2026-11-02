from subject_tools import tools_for_subject

def test_physics_gets_code_tool():
    tools = tools_for_subject("Physics")
    assert len(tools) == 1
    assert getattr(tools[0], "code_execution", None) is not None


def test_botany_no_tools():
    assert tools_for_subject("Botany") == []


if __name__ == "__main__":
    test_physics_gets_code_tool()
    test_botany_no_tools()
    print("ok")